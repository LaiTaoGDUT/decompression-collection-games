param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [ValidateRange(128, 480)]
    [int]$MaxContentDimension = 448,

    [ValidateRange(256, 496)]
    [int]$Baseline = 480,

    [switch]$PreserveLightInteriors
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) {
    throw "Input image not found: $InputPath"
}

if ($PSVersionTable.PSEdition -ne 'Desktop') {
    $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = @(
        '-NoProfile'
        '-ExecutionPolicy', 'Bypass'
        '-File', $PSCommandPath
        '-InputPath', $InputPath
        '-OutputPath', $OutputPath
        '-MaxContentDimension', $MaxContentDimension
        '-Baseline', $Baseline
    )
    if ($PreserveLightInteriors) {
        $arguments += '-PreserveLightInteriors'
    }
    & $windowsPowerShell @arguments
    exit $LASTEXITCODE
}

if (-not ('GeneratedSpriteSheetNormalizer' -as [type])) {
    Add-Type -ReferencedAssemblies 'System.Drawing.dll', 'System.Core.dll' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

public static class GeneratedSpriteSheetNormalizer
{
    private sealed class Component
    {
        public int Id;
        public int Area;
        public int MinX = int.MaxValue;
        public int MinY = int.MaxValue;
        public int MaxX = int.MinValue;
        public int MaxY = int.MinValue;
        public long SumX;
        public long SumY;

        public double CenterX { get { return Area == 0 ? 0 : (double)SumX / Area; } }
        public double CenterY { get { return Area == 0 ? 0 : (double)SumY / Area; } }
    }

    private sealed class GroupBounds
    {
        public int MinX = int.MaxValue;
        public int MinY = int.MaxValue;
        public int MaxX = int.MinValue;
        public int MaxY = int.MinValue;

        public int Width { get { return MaxX - MinX + 1; } }
        public int Height { get { return MaxY - MinY + 1; } }
    }

    public static string Normalize(
        string inputPath,
        string outputPath,
        int maxContentDimension,
        int baseline,
        bool preserveLightInteriors)
    {
        using (var loaded = new Bitmap(inputPath))
        using (var source = new Bitmap(loaded.Width, loaded.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(source))
            {
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.DrawImageUnscaled(loaded, 0, 0);
            }

            int width = source.Width;
            int height = source.Height;
            int pixelCount = checked(width * height);
            byte[] pixels = ReadPixels(source);
            bool[] background = FloodBackground(pixels, width, height, preserveLightInteriors);
            int[] labels;
            List<Component> components = LabelForeground(background, width, height, out labels);
            Component[] anchors = components
                .Where(component => component.Area >= 300)
                .OrderByDescending(component => component.Area)
                .Take(4)
                .OrderBy(component => component.CenterX)
                .ToArray();

            if (anchors.Length != 4)
            {
                throw new InvalidOperationException("Could not identify four sprite-frame subjects.");
            }

            int[] componentToGroup = Enumerable.Repeat(-1, components.Count).ToArray();
            for (int group = 0; group < anchors.Length; group += 1)
            {
                componentToGroup[anchors[group].Id] = group;
            }

            foreach (Component component in components)
            {
                if (componentToGroup[component.Id] >= 0 || component.Area < 4)
                {
                    continue;
                }

                int nearestGroup = -1;
                double nearestDistance = double.MaxValue;
                for (int group = 0; group < anchors.Length; group += 1)
                {
                    double dx = component.CenterX - anchors[group].CenterX;
                    double dy = component.CenterY - anchors[group].CenterY;
                    double distance = dx * dx + dy * dy * 0.35;
                    if (distance < nearestDistance)
                    {
                        nearestDistance = distance;
                        nearestGroup = group;
                    }
                }

                double maxDistance = component.Area >= 300 ? 320.0 : 180.0;
                if (nearestGroup >= 0 && nearestDistance <= maxDistance * maxDistance)
                {
                    componentToGroup[component.Id] = nearestGroup;
                }
            }

            var bounds = new GroupBounds[4];
            for (int group = 0; group < bounds.Length; group += 1)
            {
                bounds[group] = new GroupBounds();
            }

            for (int index = 0; index < pixelCount; index += 1)
            {
                int componentId = labels[index];
                if (componentId < 0)
                {
                    continue;
                }

                int group = componentToGroup[componentId];
                if (group < 0)
                {
                    continue;
                }

                int x = index % width;
                int y = index / width;
                GroupBounds target = bounds[group];
                target.MinX = Math.Min(target.MinX, x);
                target.MinY = Math.Min(target.MinY, y);
                target.MaxX = Math.Max(target.MaxX, x);
                target.MaxY = Math.Max(target.MaxY, y);
            }

            int maxWidth = bounds.Max(item => item.Width);
            int maxHeight = bounds.Max(item => item.Height);
            double scale = Math.Min(
                (double)maxContentDimension / maxWidth,
                (double)maxContentDimension / maxHeight);

            using (var sheet = new Bitmap(2048, 512, PixelFormat.Format32bppArgb))
            {
                using (var sheetGraphics = Graphics.FromImage(sheet))
                {
                    sheetGraphics.Clear(Color.Transparent);
                    sheetGraphics.CompositingMode = CompositingMode.SourceCopy;
                    sheetGraphics.CompositingQuality = CompositingQuality.HighQuality;
                    sheetGraphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    sheetGraphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    sheetGraphics.SmoothingMode = SmoothingMode.HighQuality;

                    for (int group = 0; group < 4; group += 1)
                    {
                        GroupBounds sourceBounds = bounds[group];
                        using (var isolated = BuildIsolatedFrame(
                            pixels,
                            labels,
                            componentToGroup,
                            width,
                            sourceBounds,
                            group))
                        {
                            int destinationWidth = Math.Max(1, (int)Math.Round(isolated.Width * scale));
                            int destinationHeight = Math.Max(1, (int)Math.Round(isolated.Height * scale));
                            int destinationX = group * 512 + (512 - destinationWidth) / 2;
                            int destinationY = baseline - destinationHeight;
                            if (destinationY < 16)
                            {
                                destinationY = 16;
                            }

                            sheetGraphics.DrawImage(
                                isolated,
                                new Rectangle(destinationX, destinationY, destinationWidth, destinationHeight),
                                new Rectangle(0, 0, isolated.Width, isolated.Height),
                                GraphicsUnit.Pixel);
                        }
                    }
                }

                string directory = Path.GetDirectoryName(outputPath);
                if (!String.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }
                sheet.Save(outputPath, ImageFormat.Png);
            }

            return String.Format(
                "{0}x{1} RGB/checkerboard -> 2048x512 RGBA; anchors={2}; scale={3:F4}; maxSourceBounds={4}x{5}",
                width,
                height,
                String.Join(",", anchors.Select(anchor => anchor.Area.ToString()).ToArray()),
                scale,
                maxWidth,
                maxHeight);
        }
    }

    private static Bitmap BuildIsolatedFrame(
        byte[] sourcePixels,
        int[] labels,
        int[] componentToGroup,
        int sourceWidth,
        GroupBounds bounds,
        int group)
    {
        var frame = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        var rectangle = new Rectangle(0, 0, frame.Width, frame.Height);
        BitmapData data = frame.LockBits(rectangle, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try
        {
            byte[] output = new byte[data.Stride * data.Height];
            for (int y = 0; y < bounds.Height; y += 1)
            {
                int sourceY = bounds.MinY + y;
                for (int x = 0; x < bounds.Width; x += 1)
                {
                    int sourceX = bounds.MinX + x;
                    int sourceIndex = sourceY * sourceWidth + sourceX;
                    int componentId = labels[sourceIndex];
                    if (componentId < 0 || componentToGroup[componentId] != group)
                    {
                        continue;
                    }

                    int sourceOffset = sourceIndex * 4;
                    int destinationOffset = y * data.Stride + x * 4;
                    output[destinationOffset] = sourcePixels[sourceOffset];
                    output[destinationOffset + 1] = sourcePixels[sourceOffset + 1];
                    output[destinationOffset + 2] = sourcePixels[sourceOffset + 2];
                    output[destinationOffset + 3] = 255;
                }
            }
            Marshal.Copy(output, 0, data.Scan0, output.Length);
        }
        finally
        {
            frame.UnlockBits(data);
        }
        return frame;
    }

    private static byte[] ReadPixels(Bitmap bitmap)
    {
        var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        BitmapData data = bitmap.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            byte[] packed = new byte[data.Stride * data.Height];
            Marshal.Copy(data.Scan0, packed, 0, packed.Length);
            if (data.Stride == bitmap.Width * 4)
            {
                return packed;
            }

            byte[] normalized = new byte[bitmap.Width * bitmap.Height * 4];
            for (int y = 0; y < bitmap.Height; y += 1)
            {
                Buffer.BlockCopy(packed, y * data.Stride, normalized, y * bitmap.Width * 4, bitmap.Width * 4);
            }
            return normalized;
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static bool[] FloodBackground(
        byte[] pixels,
        int width,
        int height,
        bool preserveLightInteriors)
    {
        int pixelCount = width * height;
        var background = new bool[pixelCount];
        var queue = new int[pixelCount];
        int read = 0;
        int write = 0;

        Action<int> enqueue = index =>
        {
            if (!background[index] && IsCheckerboardCandidate(
                pixels,
                index,
                preserveLightInteriors))
            {
                background[index] = true;
                queue[write++] = index;
            }
        };

        for (int x = 0; x < width; x += 1)
        {
            enqueue(x);
            enqueue((height - 1) * width + x);
        }
        for (int y = 0; y < height; y += 1)
        {
            enqueue(y * width);
            enqueue(y * width + width - 1);
        }

        while (read < write)
        {
            int index = queue[read++];
            int x = index % width;
            int y = index / width;
            if (x > 0) enqueue(index - 1);
            if (x + 1 < width) enqueue(index + 1);
            if (y > 0) enqueue(index - width);
            if (y + 1 < height) enqueue(index + width);
        }

        if (!preserveLightInteriors)
        {
            var strictVisited = new bool[pixelCount];
            var broadSeeds = new int[pixelCount];
            int broadSeedCount = 0;

            for (int start = 0; start < pixelCount; start += 1)
            {
                if (background[start]
                    || strictVisited[start]
                    || !IsStrictCheckerboardPixel(pixels, start))
                {
                    continue;
                }

                read = 0;
                write = 0;
                strictVisited[start] = true;
                queue[write++] = start;
                while (read < write)
                {
                    int index = queue[read++];
                    int x = index % width;
                    int y = index / width;
                    for (int offsetY = -1; offsetY <= 1; offsetY += 1)
                    {
                        int neighborY = y + offsetY;
                        if (neighborY < 0 || neighborY >= height)
                        {
                            continue;
                        }
                        for (int offsetX = -1; offsetX <= 1; offsetX += 1)
                        {
                            if (offsetX == 0 && offsetY == 0)
                            {
                                continue;
                            }
                            int neighborX = x + offsetX;
                            if (neighborX < 0 || neighborX >= width)
                            {
                                continue;
                            }
                            int neighbor = neighborY * width + neighborX;
                            if (!background[neighbor]
                                && !strictVisited[neighbor]
                                && IsStrictCheckerboardPixel(pixels, neighbor))
                            {
                                strictVisited[neighbor] = true;
                                queue[write++] = neighbor;
                            }
                        }
                    }
                }

                if (write >= 128)
                {
                    for (int componentIndex = 0; componentIndex < write; componentIndex += 1)
                    {
                        int seed = queue[componentIndex];
                        background[seed] = true;
                        broadSeeds[broadSeedCount++] = seed;
                    }
                }
            }

            read = 0;
            write = broadSeedCount;
            Array.Copy(broadSeeds, queue, broadSeedCount);
            while (read < write)
            {
                int index = queue[read++];
                int x = index % width;
                int y = index / width;
                if (x > 0) enqueue(index - 1);
                if (x + 1 < width) enqueue(index + 1);
                if (y > 0) enqueue(index - width);
                if (y + 1 < height) enqueue(index + width);
            }
        }

        return background;
    }

    private static bool IsStrictCheckerboardPixel(byte[] pixels, int pixelIndex)
    {
        int offset = pixelIndex * 4;
        int blue = pixels[offset];
        int green = pixels[offset + 1];
        int red = pixels[offset + 2];
        int minimum = Math.Min(red, Math.Min(green, blue));
        int maximum = Math.Max(red, Math.Max(green, blue));
        return minimum >= 230 && maximum - minimum <= 18;
    }

    private static bool IsCheckerboardCandidate(
        byte[] pixels,
        int pixelIndex,
        bool preserveLightInteriors)
    {
        int offset = pixelIndex * 4;
        int blue = pixels[offset];
        int green = pixels[offset + 1];
        int red = pixels[offset + 2];
        int minimum = Math.Min(red, Math.Min(green, blue));
        int maximum = Math.Max(red, Math.Max(green, blue));
        if (preserveLightInteriors)
        {
            return minimum >= 225 && maximum - minimum <= 24;
        }
        return minimum >= 90 && maximum - minimum <= 100;
    }

    private static List<Component> LabelForeground(
        bool[] background,
        int width,
        int height,
        out int[] labels)
    {
        int pixelCount = width * height;
        labels = Enumerable.Repeat(-1, pixelCount).ToArray();
        var queue = new int[pixelCount];
        var components = new List<Component>();

        for (int start = 0; start < pixelCount; start += 1)
        {
            if (background[start] || labels[start] >= 0)
            {
                continue;
            }

            var component = new Component { Id = components.Count };
            int read = 0;
            int write = 0;
            labels[start] = component.Id;
            queue[write++] = start;

            while (read < write)
            {
                int index = queue[read++];
                int x = index % width;
                int y = index / width;
                component.Area += 1;
                component.SumX += x;
                component.SumY += y;
                component.MinX = Math.Min(component.MinX, x);
                component.MinY = Math.Min(component.MinY, y);
                component.MaxX = Math.Max(component.MaxX, x);
                component.MaxY = Math.Max(component.MaxY, y);

                for (int offsetY = -1; offsetY <= 1; offsetY += 1)
                {
                    int neighborY = y + offsetY;
                    if (neighborY < 0 || neighborY >= height)
                    {
                        continue;
                    }
                    for (int offsetX = -1; offsetX <= 1; offsetX += 1)
                    {
                        if (offsetX == 0 && offsetY == 0)
                        {
                            continue;
                        }
                        int neighborX = x + offsetX;
                        if (neighborX < 0 || neighborX >= width)
                        {
                            continue;
                        }
                        int neighbor = neighborY * width + neighborX;
                        if (!background[neighbor] && labels[neighbor] < 0)
                        {
                            labels[neighbor] = component.Id;
                            queue[write++] = neighbor;
                        }
                    }
                }
            }

            components.Add(component);
        }

        return components;
    }
}
'@
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$summary = [GeneratedSpriteSheetNormalizer]::Normalize(
    $resolvedInput,
    $resolvedOutput,
    $MaxContentDimension,
    $Baseline,
    [bool]$PreserveLightInteriors
)

Write-Output "$resolvedOutput`n$summary"
