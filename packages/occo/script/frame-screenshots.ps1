param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ScreenshotFrame {
  const int Margin = 64, Padding = 12, Radius = 24, Offset = Margin + Padding;

  public static void Create(string source, string destination) {
    using (var original = new Bitmap(source))
    using (var framed = new Bitmap(original.Width + 2 * Offset, original.Height + 2 * Offset, PixelFormat.Format32bppArgb)) {
      framed.SetResolution(original.HorizontalResolution, original.VerticalResolution);
      int width = framed.Width, height = framed.Height;
      int shellWidth = original.Width + 2 * Padding, shellHeight = original.Height + 2 * Padding;
      using (var graphics = Graphics.FromImage(framed))
      using (var shadow = Rounded(Margin, Margin + 14, shellWidth, shellHeight))
      using (var brush = new SolidBrush(Color.FromArgb(46, 0, 0, 0))) {
        graphics.Clear(Color.Transparent);
        graphics.FillPath(brush, shadow);
      }

      var pixels = Pixels(framed, new Rectangle(0, 0, width, height));
      var alpha = new byte[width * height];
      for (int i = 0; i < alpha.Length; i++) alpha[i] = pixels[i * 4 + 3];
      // Three 12px box-blur passes approximate a Gaussian shadow with a 36px extent.
      for (int pass = 0; pass < 3; pass++) {
        alpha = Blur(alpha, width, height, true);
        alpha = Blur(alpha, width, height, false);
      }
      for (int i = 0; i < alpha.Length; i++) {
        pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 0;
        pixels[i * 4 + 3] = alpha[i];
      }
      var data = framed.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      try {
        for (int row = 0; row < height; row++)
          Marshal.Copy(pixels, row * width * 4, IntPtr.Add(data.Scan0, row * data.Stride), width * 4);
      } finally { framed.UnlockBits(data); }

      using (var graphics = Graphics.FromImage(framed))
      using (var shell = Rounded(Margin, Margin, shellWidth, shellHeight))
      using (var fill = new SolidBrush(Color.FromArgb(27, 29, 35)))
      using (var border = new Pen(Color.FromArgb(166, 63, 66, 75), 2)) {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.FillPath(fill, shell);
        graphics.DrawPath(border, shell);
      }
      // Copy pixels directly so image-DPI scaling or interpolation cannot alter the screenshot.
      var sourcePixels = Pixels(original, new Rectangle(0, 0, original.Width, original.Height));
      var target = framed.LockBits(new Rectangle(Offset, Offset, original.Width, original.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      try {
        for (int row = 0; row < original.Height; row++)
          Marshal.Copy(sourcePixels, row * original.Width * 4, IntPtr.Add(target.Scan0, row * target.Stride), original.Width * 4);
      } finally { framed.UnlockBits(target); }
      framed.Save(destination, ImageFormat.Png);
    }
    Check(source, destination);
  }

  public static void Check(string source, string destination) {
    using (var original = new Bitmap(source))
    using (var framed = new Bitmap(destination)) {
      if (framed.Width != original.Width + 2 * Offset || framed.Height != original.Height + 2 * Offset)
        throw new InvalidOperationException("Incorrect frame dimensions.");
      var expected = Pixels(original, new Rectangle(0, 0, original.Width, original.Height));
      var actual = Pixels(framed, new Rectangle(Offset, Offset, original.Width, original.Height));
      for (int i = 0; i < expected.Length; i++)
        if (expected[i] != actual[i])
          throw new InvalidOperationException("Screenshot pixel changed at byte " + i + ".");
      for (int x = 0; x < framed.Width; x++)
        if (framed.GetPixel(x, 0).A != 0 || framed.GetPixel(x, framed.Height - 1).A != 0)
          throw new InvalidOperationException("Shadow reaches the canvas edge.");
      for (int y = 0; y < framed.Height; y++)
        if (framed.GetPixel(0, y).A != 0 || framed.GetPixel(framed.Width - 1, y).A != 0)
          throw new InvalidOperationException("Shadow reaches the canvas edge.");
    }
  }

  static GraphicsPath Rounded(int x, int y, int width, int height) {
    var path = new GraphicsPath();
    int diameter = 2 * Radius;
    path.AddArc(x, y, diameter, diameter, 180, 90);
    path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90);
    path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90);
    path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90);
    path.CloseFigure();
    return path;
  }

  static byte[] Pixels(Bitmap bitmap, Rectangle bounds) {
    var pixels = new byte[bounds.Width * bounds.Height * 4];
    var data = bitmap.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    try {
      for (int row = 0; row < bounds.Height; row++)
        Marshal.Copy(IntPtr.Add(data.Scan0, row * data.Stride), pixels, row * bounds.Width * 4, bounds.Width * 4);
    } finally { bitmap.UnlockBits(data); }
    return pixels;
  }

  static byte[] Blur(byte[] input, int width, int height, bool horizontal) {
    const int radius = 12, divisor = 2 * radius + 1;
    var output = new byte[input.Length];
    int length = horizontal ? width : height, lines = horizontal ? height : width;
    int step = horizontal ? 1 : width;
    for (int line = 0; line < lines; line++) {
      int start = horizontal ? line * width : line, sum = 0;
      for (int i = 0; i <= radius && i < length; i++) sum += input[start + i * step];
      for (int i = 0; i < length; i++) {
        output[start + i * step] = (byte)((sum + divisor / 2) / divisor);
        if (i - radius >= 0) sum -= input[start + (i - radius) * step];
        if (i + radius + 1 < length) sum += input[start + (i + radius + 1) * step];
      }
    }
    return output;
  }
}
'@

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
foreach ($name in @('conversation-en', 'conversation-zh', 'library-en', 'library-zh')) {
  $source = Join-Path $root "docs/$name.png"
  $destination = Join-Path $root "docs/$name-framed.png"
  if ($CheckOnly) {
    [ScreenshotFrame]::Check($source, $destination)
  } else {
    [ScreenshotFrame]::Create($source, $destination)
    Copy-Item -LiteralPath $destination -Destination (Join-Path $root "packages/occo/docs/$name-framed.png") -Force
  }
  Write-Output "$name`: original pixels preserved; transparent canvas edges verified."
}
