using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Text;

public static class SheetTool
{
    private class Pix
    {
        public int W, H, Stride;
        public byte[] D;
        public Pix(int w, int h, int stride, byte[] d) { W = w; H = h; Stride = stride; D = d; }
        public int Idx(int x, int y) { return y * Stride + x * 4; }
        public int R(int x, int y) { return D[Idx(x, y) + 2]; }
        public int G(int x, int y) { return D[Idx(x, y) + 1]; }
        public int B(int x, int y) { return D[Idx(x, y) + 0]; }
    }

    private static Pix LoadPix(string path)
    {
        using (var src = new Bitmap(path))
        {
            var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) { g.DrawImage(src, 0, 0, src.Width, src.Height); }
            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] d = new byte[data.Stride * bmp.Height];
            Marshal.Copy(data.Scan0, d, 0, d.Length);
            bmp.UnlockBits(data);
            Pix p = new Pix(bmp.Width, bmp.Height, data.Stride, d);
            bmp.Dispose();
            return p;
        }
    }

    // 3-stage background mask: strict checker flood -> relaxed AA expansion -> despeckle
    private static bool[] BuildMask(Pix pix, int despeckleMin, out int cleared)
    {
        int W = pix.W, H = pix.H;
        bool[] bg = new bool[W * H];

        Func<int, int, int> grayness = delegate(int x, int y)
        {
            int r = pix.R(x, y), g = pix.G(x, y), b = pix.B(x, y);
            return Math.Max(Math.Abs(r - g), Math.Max(Math.Abs(g - b), Math.Abs(r - b)));
        };
        Func<int, int, int> val = delegate(int x, int y)
        {
            return (pix.R(x, y) + pix.G(x, y) + pix.B(x, y)) / 3;
        };

        Queue<int> q = new Queue<int>();

        // stage 1: strict checker pixels
        Func<int, int, bool> cand1 = delegate(int x, int y) { return grayness(x, y) <= 8 && val(x, y) >= 223; };
        for (int x = 0; x < W; x++)
        {
            if (cand1(x, 0) && !bg[x]) { bg[x] = true; q.Enqueue(x); }
            int i2 = (H - 1) * W + x;
            if (cand1(x, H - 1) && !bg[i2]) { bg[i2] = true; q.Enqueue(i2); }
        }
        for (int y = 0; y < H; y++)
        {
            int i1 = y * W;
            if (cand1(0, y) && !bg[i1]) { bg[i1] = true; q.Enqueue(i1); }
            int i2 = y * W + (W - 1);
            if (cand1(W - 1, y) && !bg[i2]) { bg[i2] = true; q.Enqueue(i2); }
        }
        while (q.Count > 0)
        {
            int i = q.Dequeue();
            int x = i % W; int y = i / W;
            if (x > 0) { int j = i - 1; if (!bg[j] && cand1(x - 1, y)) { bg[j] = true; q.Enqueue(j); } }
            if (x < W - 1) { int j = i + 1; if (!bg[j] && cand1(x + 1, y)) { bg[j] = true; q.Enqueue(j); } }
            if (y > 0) { int j = i - W; if (!bg[j] && cand1(x, y - 1)) { bg[j] = true; q.Enqueue(j); } }
            if (y < H - 1) { int j = i + W; if (!bg[j] && cand1(x, y + 1)) { bg[j] = true; q.Enqueue(j); } }
        }

        // stage 2: expand from bg into looser gray pixels (AA halo, leftover fragments)
        Func<int, int, bool> cand2 = delegate(int x, int y) { return grayness(x, y) <= 14 && val(x, y) >= 196; };
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
                if (bg[y * W + x]) q.Enqueue(y * W + x);
        while (q.Count > 0)
        {
            int i = q.Dequeue();
            int x = i % W; int y = i / W;
            if (x > 0) { int j = i - 1; if (!bg[j] && cand2(x - 1, y)) { bg[j] = true; q.Enqueue(j); } }
            if (x < W - 1) { int j = i + 1; if (!bg[j] && cand2(x + 1, y)) { bg[j] = true; q.Enqueue(j); } }
            if (y > 0) { int j = i - W; if (!bg[j] && cand2(x, y - 1)) { bg[j] = true; q.Enqueue(j); } }
            if (y < H - 1) { int j = i + W; if (!bg[j] && cand2(x, y + 1)) { bg[j] = true; q.Enqueue(j); } }
        }

        // stage 3: despeckle - remove small isolated content components
        if (despeckleMin > 0)
        {
            int[] label = new int[W * H];
            int comp = 0;
            int[] dx = new int[] { 1, -1, 0, 0 };
            int[] dy = new int[] { 0, 0, 1, -1 };
            List<int> sizes = new List<int>();
            List<List<int>> members = new List<List<int>>();
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    int idx = y * W + x;
                    if (bg[idx] || label[idx] != 0) continue;
                    comp++;
                    int size = 0;
                    List<int> mem = new List<int>();
                    Queue<int> cq = new Queue<int>();
                    cq.Enqueue(idx); label[idx] = comp;
                    while (cq.Count > 0)
                    {
                        int i = cq.Dequeue();
                        mem.Add(i); size++;
                        int cx = i % W, cy = i / W;
                        for (int k = 0; k < 4; k++)
                        {
                            int nx = cx + dx[k], ny = cy + dy[k];
                            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                            int j = ny * W + nx;
                            if (bg[j] || label[j] != 0) continue;
                            label[j] = comp; cq.Enqueue(j);
                        }
                    }
                    sizes.Add(size);
                    members.Add(mem);
                }
            }
            for (int ci = 0; ci < comp; ci++)
            {
                if (sizes[ci] < despeckleMin)
                {
                    foreach (int i in members[ci]) bg[i] = true;
                }
            }
        }

        cleared = 0;
        for (int i = 0; i < bg.Length; i++) if (bg[i]) cleared++;
        return bg;
    }

    public static string Analyze(string path)
    {
        Pix pix = LoadPix(path);
        StringBuilder sb = new StringBuilder();
        int cleared;
        bool[] bg = BuildMask(pix, 0, out cleared);
        sb.AppendLine("size " + pix.W + "x" + pix.H);
        sb.AppendLine("mask stage1+2 cleared: " + cleared + " (" + Math.Round(100.0 * cleared / (pix.W * pix.H), 1) + "%)");
        return sb.ToString();
    }

    private static List<int[]> Bands(int[] cnt, int n, int thr, int maxGap)
    {
        List<int[]> bands = new List<int[]>();
        int i = 0;
        while (i < n)
        {
            if (cnt[i] >= thr)
            {
                int j = i;
                while (j < n && cnt[j] >= thr) j++;
                bands.Add(new int[] { i, j - 1 });
                i = j;
            }
            else i++;
        }
        List<int[]> merged = new List<int[]>();
        foreach (int[] b in bands)
        {
            if (merged.Count > 0 && b[0] - merged[merged.Count - 1][1] <= maxGap)
                merged[merged.Count - 1][1] = b[1];
            else
                merged.Add(new int[] { b[0], b[1] });
        }
        return merged;
    }

    public static string GridDebug(string path, string outPath)
    {
        Pix pix = LoadPix(path);
        int W = pix.W, H = pix.H;
        int cleared;
        bool[] bg = BuildMask(pix, 250, out cleared);

        StringBuilder sb = new StringBuilder();
        sb.AppendLine("mask cleared: " + cleared + " (" + Math.Round(100.0 * cleared / (W * H), 1) + "%)");

        int[] rowCnt = new int[H];
        int[] colCntTotal = new int[W];
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
                if (!bg[y * W + x]) { rowCnt[y]++; colCntTotal[x]++; }

        List<int[]> rows = Bands(rowCnt, H, 30, 4);
        sb.AppendLine("rows: " + rows.Count);
        for (int i = 0; i < rows.Count; i++)
        {
            int[] r = rows[i];
            sb.Append("  row y " + r[0] + ".." + r[1] + " (h" + (r[1] - r[0] + 1) + ")");
            if (i > 0) sb.Append(" gap=" + (r[0] - rows[i - 1][1] - 1));
            sb.AppendLine();
        }

        // per-row frame bands
        List<List<int[]>> framesPerRow = new List<List<int[]>>();
        foreach (int[] r in rows)
        {
            int[] colCnt = new int[W];
            for (int y = r[0]; y <= r[1]; y++)
                for (int x = 0; x < W; x++)
                    if (!bg[y * W + x]) colCnt[x]++;
            List<int[]> fb = Bands(colCnt, W, 3, 5);
            framesPerRow.Add(fb);
            sb.Append("  frames (" + fb.Count + "): ");
            foreach (int[] b in fb) sb.Append("[" + b[0] + ".." + b[1] + "]w" + (b[1] - b[0] + 1) + " ");
            sb.AppendLine();
        }

        // overlay debug image
        using (var outBmp = new Bitmap(W, H, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(outBmp))
            {
                g.DrawImage(Image.FromFile(path), 0, 0, W, H);
                using (var penRow = new Pen(Color.FromArgb(160, 255, 80, 80), 2))
                using (var penFrame = new Pen(Color.FromArgb(220, 80, 160, 255), 1))
                using (var penSlot = new Pen(Color.FromArgb(220, 60, 220, 120), 1))
                using (var font = new Font(FontFamily.GenericMonospace, 11, FontStyle.Bold))
                using (var brush = new SolidBrush(Color.FromArgb(255, 255, 220, 40)))
                {
                    for (int ri = 0; ri < rows.Count; ri++)
                    {
                        int[] r = rows[ri];
                        g.DrawLine(penRow, 0, r[0], W, r[0]);
                        g.DrawLine(penRow, 0, r[1], W, r[1]);
                        List<int[]> fb = framesPerRow[ri];
                        for (int fi = 0; fi < fb.Count; fi++)
                        {
                            int[] f = fb[fi];
                            g.DrawRectangle(penFrame, f[0], r[0] + 1, f[1] - f[0] - 1, r[1] - r[0] - 2);
                            g.DrawString("R" + (ri + 1) + "S" + (fi + 1), font, brush, f[0] + 2, r[0] + 3);
                        }
                    }
                }
            }
            outBmp.Save(outPath, ImageFormat.Png);
        }
        sb.AppendLine("saved " + outPath);
        return sb.ToString();
    }

    public static string Crop(string path, int x, int y, int w, int h, string outPath, int zoom)
    {
        Pix pix = LoadPix(path);
        using (var outBmp = new Bitmap(w * zoom, h * zoom, PixelFormat.Format32bppArgb))
        {
            for (int yy = 0; yy < h; yy++)
            {
                for (int xx = 0; xx < w; xx++)
                {
                    int sx = x + xx, sy = y + yy;
                    Color c = Color.FromArgb(255, 255, 255, 255);
                    if (sx >= 0 && sy >= 0 && sx < pix.W && sy < pix.H)
                        c = Color.FromArgb(255, pix.R(sx, sy), pix.G(sx, sy), pix.B(sx, sy));
                    for (int zy = 0; zy < zoom; zy++)
                        for (int zx = 0; zx < zoom; zx++)
                            outBmp.SetPixel(xx * zoom + zx, yy * zoom + zy, c);
                }
            }
            outBmp.Save(outPath, ImageFormat.Png);
        }
        return "saved " + outPath;
    }

    public static string MaskDebug(string path, string outPath)
    {
        Pix pix = LoadPix(path);
        int W = pix.W, H = pix.H;
        int cleared;
        bool[] bg = BuildMask(pix, 250, out cleared);
        using (var outBmp = new Bitmap(W, H, PixelFormat.Format32bppArgb))
        {
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    if (bg[y * W + x])
                        outBmp.SetPixel(x, y, Color.FromArgb(255, 0, 255));
                    else
                        outBmp.SetPixel(x, y, Color.FromArgb(255, pix.R(x, y), pix.G(x, y), pix.B(x, y)));
                }
            }
            outBmp.Save(outPath, ImageFormat.Png);
        }
        return "saved " + outPath;
    }

    // =====================  EXPORT  =====================

    /**
     * Imports a horizontal cast sheet: one character per row, 12 frames per
     * row laid out as down(3) / side(3) / side(3) / up(3).
     *
     * The two side groups are measured (face offset against the body centre)
     * so the left-facing group always becomes the LEFT row and the other one
     * the RIGHT row. Every character is written as its own 97x153, 3x4 sheet.
     */
    public static string ExportNpcCast(string path, string outDir, string[] names)
    {
        Pix pix = LoadPix(path);
        int W = pix.W, H = pix.H;
        int cleared;
        bool[] bg = BuildMask(pix, 250, out cleared);
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("size " + W + "x" + H + " cleared=" + cleared);

        int[] rowCnt = new int[H];
        for (int y = 0; y < H; y++)
        {
            int c = 0;
            for (int x = 0; x < W; x++) if (!bg[y * W + x]) c++;
            rowCnt[y] = c;
        }
        List<int[]> rows = Bands(rowCnt, H, 20, 6);
        sb.AppendLine("rows=" + rows.Count);
        for (int i = 0; i < rows.Count; i++)
        {
            sb.AppendLine("  row " + (i + 1) + " y" + rows[i][0] + ".." + rows[i][1] + " h=" + (rows[i][1] - rows[i][0] + 1));
        }

        System.IO.Directory.CreateDirectory(outDir);
        List<string> written = new List<string>();

        for (int ri = 0; ri < rows.Count; ri++)
        {
            int[] row = rows[ri];
            int[] colCnt = new int[W];
            for (int y = row[0]; y <= row[1]; y++)
                for (int x = 0; x < W; x++)
                    if (!bg[y * W + x]) colCnt[x]++;
            List<int[]> cols = Bands(colCnt, W, 3, 4);
            sb.AppendLine("  row " + (ri + 1) + " columns=" + cols.Count);
            if (cols.Count < 12) continue;

            // Extract the 12 frames of this character.
            List<Extracted> frames = new List<Extracted>();
            for (int ci = 0; ci < 12; ci++)
            {
                int[] band = cols[ci];
                int xa = Math.Max(0, band[0] - 2), xb = Math.Min(W - 1, band[1] + 2);
                int ya = Math.Max(0, row[0] - 4), yb = Math.Min(H - 1, row[1] + 4);
                int minx = int.MaxValue, miny = int.MaxValue, maxx = -1, maxy = -1;
                for (int y = ya; y <= yb; y++)
                    for (int x = xa; x <= xb; x++)
                        if (!bg[y * W + x])
                        {
                            if (x < minx) minx = x; if (x > maxx) maxx = x;
                            if (y < miny) miny = y; if (y > maxy) maxy = y;
                        }
                Extracted e = new Extracted();
                e.Row = ri; e.Slot = ci;
                if (maxx < 0) { e.W = 0; e.H = 0; frames.Add(e); continue; }
                e.X = minx; e.Y = miny; e.W = maxx - minx + 1; e.H = maxy - miny + 1;
                Bitmap bmp = new Bitmap(e.W, e.H, PixelFormat.Format32bppArgb);
                for (int y = miny; y <= maxy; y++)
                {
                    for (int x = minx; x <= maxx; x++)
                    {
                        if (!bg[y * W + x])
                            bmp.SetPixel(x - minx, y - miny, Color.FromArgb(255, pix.R(x, y), pix.G(x, y), pix.B(x, y)));
                    }
                }
                e.Bmp = bmp;
                frames.Add(e);
            }

            // Which side group faces which way?
            double offsetA = FaceOffset(frames[4]);
            double offsetB = FaceOffset(frames[7]);
            bool aIsRight = offsetA > offsetB;
            sb.AppendLine("    face offset sideA=" + Math.Round(offsetA, 1) + " sideB=" + Math.Round(offsetB, 1) +
                          " -> " + (aIsRight ? "sideA=right" : "sideA=left"));

            // Source group order: down(0-2) sideA(3-5) sideB(6-8) up(9-11).
            List<Extracted> groups = new List<Extracted>();
            groups.Add(frames[0]); groups.Add(frames[1]); groups.Add(frames[2]);
            if (aIsRight)
            {
                groups.Add(frames[6]); groups.Add(frames[7]); groups.Add(frames[8]);
                groups.Add(frames[3]); groups.Add(frames[4]); groups.Add(frames[5]);
            }
            else
            {
                groups.Add(frames[3]); groups.Add(frames[4]); groups.Add(frames[5]);
                groups.Add(frames[6]); groups.Add(frames[7]); groups.Add(frames[8]);
            }
            groups.Add(frames[9]); groups.Add(frames[10]); groups.Add(frames[11]);

            // One scale for the whole character so the frames stay consistent.
            List<int> hs = new List<int>();
            List<int> ws = new List<int>();
            foreach (Extracted e in groups) { if (e.W > 0) { hs.Add(e.H); ws.Add(e.W); } }
            hs.Sort(); ws.Sort();
            int medianH = hs[hs.Count / 2];
            int maxH = hs[hs.Count - 1];
            int maxW = ws[ws.Count - 1];
            double scale = 143.0 / medianH;
            scale = Math.Min(scale, 145.0 / maxH);
            scale = Math.Min(scale, 93.0 / maxW);
            sb.AppendLine("    medianH=" + medianH + " maxH=" + maxH + " maxW=" + maxW + " scale=" + Math.Round(scale, 3));

            const int FW = 97, FH = 153, FEET = 147;
            using (Bitmap sheet = new Bitmap(FW * 3, FH * 4, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(sheet))
                {
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    for (int i = 0; i < groups.Count; i++)
                    {
                        Extracted e = groups[i];
                        if (e.W == 0) continue;
                        int dir = i / 3, col = i % 3;
                        int sw = (int)Math.Round(e.W * scale);
                        int sh = (int)Math.Round(e.H * scale);
                        if (sh > FEET - 6) sh = FEET - 6;
                        int dx = col * FW + (FW - sw) / 2;
                        int dy = dir * FH + (FEET - sh);
                        g.DrawImage(e.Bmp, new Rectangle(dx, dy, sw, sh), 0, 0, e.W, e.H, GraphicsUnit.Pixel);
                    }
                }
                string id = ri < names.Length ? names[ri] : "npc_" + (ri + 1);
                string outPath = System.IO.Path.Combine(outDir, "char_" + id + ".png");
                sheet.Save(outPath, ImageFormat.Png);
                written.Add(outPath);
                sb.AppendLine("    saved " + outPath);
            }
        }

        sb.AppendLine("characters=" + written.Count);
        return sb.ToString();
    }

    /**
     * Measures how far the face sits from the body centre of a frame.
     * Positive means the character faces right, negative means left.
     */
    private static double FaceOffset(Extracted frame)
    {
        if (frame.W == 0) return 0;
        Bitmap bmp = frame.Bmp;
        double skinX = 0, bodyX = 0;
        int skinN = 0, bodyN = 0;
        for (int y = 0; y < bmp.Height; y++)
        {
            for (int x = 0; x < bmp.Width; x++)
            {
                Color c = bmp.GetPixel(x, y);
                if (c.A < 128) continue;
                bodyX += x; bodyN++;
                bool skin = c.R > 165 && c.G > 95 && c.B < 175 && (c.R - c.G) > 12 && (c.G - c.B) > 8;
                if (skin) { skinX += x; skinN++; }
            }
        }
        if (skinN < 20 || bodyN == 0) return 0;
        double skinCx = skinX / skinN, bodyCx = bodyX / bodyN;
        return skinCx - bodyCx;
    }

    /**
     * Standardizes a standalone 3x4 RPG Maker sheet (one character, 3 columns
     * x 4 rows) into the 97x153 frames used by the preset registry.
     *
     * Source order is assumed to be down / side / side / up, with column 0 as
     * the idle pose. The first side row is mirrored for LEFT and the second is
     * used for RIGHT, which also fixes sheets whose two side rows were both
     * drawn facing right. Background is removed with the same checker/AA mask
     * as the cast importer; the largest 8-connected component per cell is the
     * character (baked drop shadows are dropped with the background).
     */
    public static string Process34(string path, string outPath)
    {
        Pix pix = LoadPix(path);
        int W = pix.W, H = pix.H;
        int cleared;
        bool[] bg = BuildMask(pix, 250, out cleared);
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("size " + W + "x" + H + " cleared=" + cleared);

        int cw = W / 3;
        int ch = H / 4;
        Extracted[,] cells = new Extracted[4, 3];
        List<int> heights = new List<int>();
        List<int> widths = new List<int>();

        for (int r = 0; r < 4; r++)
        {
            for (int c = 0; c < 3; c++)
            {
                int xa = c * cw, ya = r * ch;
                int xb = Math.Min(W, xa + cw), yb = Math.Min(H, ya + ch);
                int bw = xb - xa, bh = yb - ya;
                bool[] seen = new bool[bw * bh];
                int bestSize = 0;
                int bestMinX = 0, bestMinY = 0, bestMaxX = 0, bestMaxY = 0;
                bool[] bestMembers = null;

                for (int y = 0; y < bh; y++)
                {
                    for (int x = 0; x < bw; x++)
                    {
                        int idx = y * bw + x;
                        if (seen[idx] || bg[(ya + y) * W + (xa + x)]) continue;
                        seen[idx] = true;
                        Queue<int> q = new Queue<int>();
                        List<int> members = new List<int>();
                        q.Enqueue(idx);
                        int minx = x, maxx = x, miny = y, maxy = y;
                        while (q.Count > 0)
                        {
                            int i = q.Dequeue();
                            members.Add(i);
                            int cx = i % bw, cy = i / bw;
                            if (cx < minx) minx = cx; if (cx > maxx) maxx = cx;
                            if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
                            for (int dy = -1; dy <= 1; dy++)
                            {
                                for (int dx = -1; dx <= 1; dx++)
                                {
                                    if (dx == 0 && dy == 0) continue;
                                    int nx = cx + dx, ny = cy + dy;
                                    if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
                                    int j = ny * bw + nx;
                                    if (seen[j] || bg[(ya + ny) * W + (xa + nx)]) continue;
                                    seen[j] = true;
                                    q.Enqueue(j);
                                }
                            }
                        }
                        if (members.Count > bestSize)
                        {
                            bestSize = members.Count;
                            bestMinX = minx; bestMaxX = maxx; bestMinY = miny; bestMaxY = maxy;
                            bool[] membersMask = new bool[bw * bh];
                            foreach (int i in members) membersMask[i] = true;
                            bestMembers = membersMask;
                        }
                    }
                }

                Extracted e = new Extracted();
                e.Row = r; e.Slot = c;
                if (bestSize == 0) { e.W = 0; e.H = 0; cells[r, c] = e; continue; }
                e.X = xa + bestMinX; e.Y = ya + bestMinY;
                e.W = bestMaxX - bestMinX + 1;
                e.H = bestMaxY - bestMinY + 1;
                Bitmap bmp = new Bitmap(e.W, e.H, PixelFormat.Format32bppArgb);
                for (int y = bestMinY; y <= bestMaxY; y++)
                {
                    for (int x = bestMinX; x <= bestMaxX; x++)
                    {
                        int mi = y * bw + x;
                        if (!bestMembers[mi]) continue;
                        int sx = xa + x, sy = ya + y;
                        bmp.SetPixel(x - bestMinX, y - bestMinY, Color.FromArgb(255, pix.R(sx, sy), pix.G(sx, sy), pix.B(sx, sy)));
                    }
                }
                e.Bmp = bmp;
                cells[r, c] = e;
                heights.Add(e.H);
                widths.Add(e.W);
                sb.AppendLine("  r" + r + "c" + c + " bbox=" + e.X + "," + e.Y + " " + e.W + "x" + e.H + " area=" + bestSize);
            }
        }

        int[] hs = heights.ToArray();
        int[] ws = widths.ToArray();
        Array.Sort(hs);
        Array.Sort(ws);
        int medianH = hs[hs.Length / 2];
        int maxH = hs[hs.Length - 1];
        int maxW = ws[ws.Length - 1];
        // Fit the median frame to the same 143px body height as the cast
        // presets, but never let the tallest/widest pose exceed the cell.
        double scale = 143.0 / medianH;
        scale = Math.Min(scale, 145.0 / maxH);
        scale = Math.Min(scale, 93.0 / maxW);
        sb.AppendLine("heights=" + string.Join(",", hs) + " widths=" + string.Join(",", ws));
        sb.AppendLine("medianH=" + medianH + " maxH=" + maxH + " maxW=" + maxW + " scale=" + Math.Round(scale, 3));

        const int FW = 97, FH = 153, FEET = 147;
        using (Bitmap sheet = new Bitmap(FW * 3, FH * 4, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(sheet))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // Output rows: 0 down, 1 left, 2 right, 3 up.
                // The supplied 3x4 sheet already follows that order: its first
                // side row faces left and its second side row faces right.
                int[] srcRow = new int[] { 0, 1, 2, 3 };
                // Columns: step / idle / step. The source puts idle first, so
                // reorder to the registry's step-idle-step convention.
                int[] srcCol = new int[] { 1, 0, 2 };

                for (int dir = 0; dir < 4; dir++)
                {
                    for (int col = 0; col < 3; col++)
                    {
                        Extracted e = cells[srcRow[dir], srcCol[col]];
                        if (e.W == 0) continue;
                        int sw = (int)Math.Round(e.W * scale);
                        int sh = (int)Math.Round(e.H * scale);
                        if (sh > FEET - 6) { sh = FEET - 6; }
                        int dx = col * FW + (FW - sw) / 2;
                        int dy = dir * FH + (FEET - sh);
                        g.DrawImage(e.Bmp, new Rectangle(dx, dy, sw, sh), 0, 0, e.W, e.H, GraphicsUnit.Pixel);
                    }
                }
            }
            sheet.Save(outPath, ImageFormat.Png);
        }

        sb.AppendLine("saved " + outPath);
        return sb.ToString();
    }

    private class FrameRef
    {
        public int Row; public int Slot;
        public FrameRef(int r, int s) { Row = r; Slot = s; }
    }

    private class Extracted
    {
        public int Row, Slot;
        public int X, Y, W, H;          // bbox in source
        public Bitmap Bmp;               // RGBA cutout
        public double Scale = 1.0;
        public bool TouchedEdge;
    }

    private static Bitmap Mirror(Bitmap src)
    {
        Bitmap dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(dst))
        {
            g.Transform = new System.Drawing.Drawing2D.Matrix(-1, 0, 0, 1, src.Width, 0);
            g.DrawImage(src, 0, 0, src.Width, src.Height);
        }
        return dst;
    }

    public static string Export(string path, string outDir)
    {
        Pix pix = LoadPix(path);
        int W = pix.W, H = pix.H;
        int cleared;
        bool[] bg = BuildMask(pix, 250, out cleared);
        StringBuilder sb = new StringBuilder();

        int[] rowCnt = new int[H];
        for (int y = 0; y < H; y++) { int c = 0; for (int x = 0; x < W; x++) if (!bg[y * W + x]) c++; rowCnt[y] = c; }
        List<int[]> rows = Bands(rowCnt, H, 30, 4);
        sb.AppendLine("rows=" + rows.Count);

        List<List<int[]>> slots = new List<List<int[]>>();
        foreach (int[] r in rows)
        {
            int[] cc = new int[W];
            for (int y = r[0]; y <= r[1]; y++) for (int x = 0; x < W; x++) if (!bg[y * W + x]) cc[x]++;
            slots.Add(Bands(cc, W, 3, 5));
        }
        for (int i = 0; i < rows.Count; i++)
        {
            sb.Append("  row " + (i + 1) + " y" + rows[i][0] + ".." + rows[i][1] + " slots=" + slots[i].Count + ": ");
            foreach (int[] s in slots[i]) sb.Append("[" + s[0] + ".." + s[1] + "] ");
            sb.AppendLine();
        }

        // frame extraction cache
        Dictionary<string, Extracted> cache = new Dictionary<string, Extracted>();
        List<Extracted> allFrames = new List<Extracted>();

        Func<int, int, Extracted> get = null;
        get = delegate(int rowIdx, int slotIdx)
        {
            string key = rowIdx + "_" + slotIdx;
            if (cache.ContainsKey(key)) return cache[key];
            int[] r = rows[rowIdx];
            int[] s = slots[rowIdx][slotIdx];
            int xa = Math.Max(0, s[0] - 2), xb = Math.Min(W - 1, s[1] + 2);
            int ya = Math.Max(0, r[0] - 4), yb = Math.Min(H - 1, r[1] + 4);
            int minx = int.MaxValue, miny = int.MaxValue, maxx = -1, maxy = -1;
            for (int y = ya; y <= yb; y++)
                for (int x = xa; x <= xb; x++)
                    if (!bg[y * W + x]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
            Extracted e = new Extracted();
            e.Row = rowIdx; e.Slot = slotIdx;
            if (maxx < 0) { e.W = 0; e.H = 0; cache[key] = e; return e; }
            e.X = minx; e.Y = miny; e.W = maxx - minx + 1; e.H = maxy - miny + 1;
            e.TouchedEdge = (minx <= xa || maxx >= xb || miny <= ya || maxy >= yb);
            Bitmap bmp = new Bitmap(e.W, e.H, PixelFormat.Format32bppArgb);
            for (int y = miny; y <= maxy; y++)
            {
                for (int x = minx; x <= maxx; x++)
                {
                    if (!bg[y * W + x])
                        bmp.SetPixel(x - minx, y - miny, Color.FromArgb(255, pix.R(x, y), pix.G(x, y), pix.B(x, y)));
                }
            }
            e.Bmp = bmp;
            cache[key] = e;
            allFrames.Add(e);
            return e;
        };

        // character definitions: slotStart (0-based), slotCount, upRow, upStart, upCount
        // rows (0-based): 0=front idle, 1=front walk, 2=side (faces right), 3=backs mixed, 4=variants, 5=backs clean
        string[][] defs = new string[][] {
            new string[] { "office_worker",    "0",  "3", "",  "",  ""  },
            new string[] { "soc_analyst",      "3",  "3", "",  "",  ""  },
            new string[] { "consultant",       "6",  "2", "",  "",  ""  },
            new string[] { "project_manager",  "8",  "3", "",  "",  ""  },
            new string[] { "devops_engineer",  "11", "2", "4", "0", "3" },
            new string[] { "field_engineer",   "13", "2", "",  "",  ""  },
            new string[] { "office_admin",     "15", "1", "",  "",  ""  },
        };

        // pass 1: collect all refs
        List<List<FrameRef>[]> perChar = new List<List<FrameRef>[]>();
        // A direction whose three refs point at the same source frame has no
        // step art. The compose pass below bakes a small bob into those cells
        // so every preset still animates instead of sliding while frozen.
        List<bool[]> generatedGait = new List<bool[]>();
        foreach (string[] def in defs)
        {
            int start = int.Parse(def[1]); int n = int.Parse(def[2]);
            int upRow = def[3] == "" ? 5 : int.Parse(def[3]);
            int upStart = def[4] == "" ? start : int.Parse(def[4]);
            int upCount = def[5] == "" ? n : int.Parse(def[5]);
            List<FrameRef> down = new List<FrameRef>();
            List<FrameRef> left = new List<FrameRef>();
            List<FrameRef> up = new List<FrameRef>();
            // down: walk steps from walking row, stand (row 0) as the middle idle frame
            if (n >= 3)
            {
                down.Add(new FrameRef(1, start)); down.Add(new FrameRef(0, start + 1)); down.Add(new FrameRef(1, start + 2));
            }
            else if (n == 2)
            {
                down.Add(new FrameRef(1, start)); down.Add(new FrameRef(0, start)); down.Add(new FrameRef(1, start + 1));
            }
            else
            {
                down.Add(new FrameRef(1, start)); down.Add(new FrameRef(0, start)); down.Add(new FrameRef(1, start));
            }
            // left / right: the source side row is drawn facing right, so the
            // unmirrored art is the right-facing row and the mirror is left.
            if (n >= 3)
            {
                left.Add(new FrameRef(2, start)); left.Add(new FrameRef(2, start + 1)); left.Add(new FrameRef(2, start + 2));
            }
            else if (n == 2)
            {
                left.Add(new FrameRef(2, start)); left.Add(new FrameRef(2, start + 1)); left.Add(new FrameRef(2, start));
            }
            else
            {
                left.Add(new FrameRef(2, start)); left.Add(new FrameRef(2, start)); left.Add(new FrameRef(2, start));
            }
            // up (back views)
            if (upCount >= 3)
            {
                up.Add(new FrameRef(upRow, upStart)); up.Add(new FrameRef(upRow, upStart + 1)); up.Add(new FrameRef(upRow, upStart + 2));
            }
            else if (upCount == 2)
            {
                up.Add(new FrameRef(upRow, upStart)); up.Add(new FrameRef(upRow, upStart + 1)); up.Add(new FrameRef(upRow, upStart));
            }
            else
            {
                up.Add(new FrameRef(upRow, upStart)); up.Add(new FrameRef(upRow, upStart)); up.Add(new FrameRef(upRow, upStart));
            }
            List<FrameRef>[] dirs = new List<FrameRef>[4];
            dirs[0] = down; dirs[1] = left; dirs[2] = left; dirs[3] = up; // index 1 mirrors left at compose time
            perChar.Add(dirs);

            bool[] staticDirs = new bool[4];
            for (int d = 0; d < 4; d++)
            {
                staticDirs[d] = dirs[d][0].Row == dirs[d][1].Row && dirs[d][0].Slot == dirs[d][1].Slot
                             && dirs[d][1].Row == dirs[d][2].Row && dirs[d][1].Slot == dirs[d][2].Slot;
            }
            generatedGait.Add(staticDirs);
        }

        // extract all frames (updates cache)
        foreach (List<FrameRef>[] dirs in perChar)
            foreach (List<FrameRef> lst in dirs)
                foreach (FrameRef fr in lst)
                    get(fr.Row, fr.Slot);

        // global median height
        List<int> hs = new List<int>();
        foreach (Extracted e in allFrames) if (e.H > 0) hs.Add(e.H);
        hs.Sort();
        int targetH = hs[hs.Count / 2];
        sb.AppendLine("frames=" + allFrames.Count + " medianH=" + targetH);

        foreach (Extracted e in allFrames)
        {
            if (e.H > 0)
            {
                double s = (double)targetH / e.H;
                if (s < 0.8) s = 0.8; if (s > 1.25) s = 1.25;
                e.Scale = s;
            }
        }

        // cell size
        double maxSW = 0, maxSH = 0;
        foreach (Extracted e in allFrames)
        {
            if (e.W > 0)
            {
                double sw = e.W * e.Scale, sh = e.H * e.Scale;
                if (sw > maxSW) maxSW = sw; if (sh > maxSH) maxSH = sh;
            }
        }
        int cellW = (int)Math.Ceiling(maxSW) + 10;
        int cellH = (int)Math.Ceiling(maxSH) + 10;
        sb.AppendLine("cell " + cellW + "x" + cellH);

        System.IO.Directory.CreateDirectory(outDir);

        // compose sheets
        List<string> fileList = new List<string>();
        for (int ci = 0; ci < defs.Length; ci++)
        {
            string id = defs[ci][0];
            List<FrameRef>[] dirs = perChar[ci];
            Bitmap sheet = new Bitmap(cellW * 3, cellH * 4, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(sheet))
            {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                for (int dir = 0; dir < 4; dir++)
                {
                    for (int col = 0; col < 3; col++)
                    {
                        FrameRef fr = dirs[dir][col];
                        Extracted e = get(fr.Row, fr.Slot);
                        if (e.W == 0) continue;
                        int sw = (int)Math.Round(e.W * e.Scale);
                        int sh = (int)Math.Round(e.H * e.Scale);
                        // Generated gait: keep the middle cell planted and bob the
                        // two step cells up with a slight lean. Mirror the lean on
                        // the right-facing row so it follows the body direction.
                        int offX = 0, offY = 0;
                        if (generatedGait[ci][dir])
                        {
                            offY = (col == 1) ? 0 : -4;
                            offX = (col == 0 ? -3 : (col == 2 ? 3 : 0)) * (dir == 1 ? -1 : 1);
                        }
                        int dx = col * cellW + (cellW - sw) / 2 + offX;
                        int dy = dir * cellH + (cellH - 6 - sh) + offY;
                        Bitmap src = (dir == 1) ? Mirror(e.Bmp) : e.Bmp;
                        g.DrawImage(src, new Rectangle(dx, dy, sw, sh), 0, 0, e.W, e.H, GraphicsUnit.Pixel);
                        if (dir == 1) src.Dispose();
                    }
                }
            }
            string outPath = System.IO.Path.Combine(outDir, "char_" + id + ".png");
            sheet.Save(outPath, ImageFormat.Png);
            sheet.Dispose();
            fileList.Add(outPath);
            sb.AppendLine("  " + id + ": " + outPath + " scaleRange[" +
                Math.Round(dirs[0][0] != null ? get(dirs[0][0].Row, dirs[0][0].Slot).Scale : 1, 2) + "]");
            for (int dir = 0; dir < 4; dir++)
            {
                string line = "    dir" + dir + (generatedGait[ci][dir] ? " [generated gait]" : "") + ":";
                for (int col = 0; col < 3; col++)
                {
                    FrameRef f2 = dirs[dir][col];
                    Extracted e2 = get(f2.Row, f2.Slot);
                    line += " R" + (f2.Row + 1) + "S" + (f2.Slot + 1) + "(h" + e2.H + ",s" + Math.Round(e2.Scale, 2) + (e2.TouchedEdge ? ",EDGE" : "") + ")";
                }
                sb.AppendLine(line);
            }
        }

        // preview strip
        int gap = 10;
        int totalW = defs.Length * cellW * 3 + (defs.Length - 1) * gap;
        using (Bitmap prev = new Bitmap(totalW, cellH * 4 + 24, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(prev))
            {
                g.Clear(Color.FromArgb(255, 24, 26, 38));
                using (Font f = new Font(FontFamily.GenericMonospace, 12, FontStyle.Bold))
                using (Brush br = new SolidBrush(Color.Yellow))
                {
                    for (int i = 0; i < fileList.Count; i++)
                    {
                        using (Bitmap b = new Bitmap(fileList[i]))
                        {
                            int x = i * (cellW * 3 + gap);
                            g.DrawImage(b, x, 20, b.Width, b.Height);
                            g.DrawString(defs[i][0], f, br, x + 4, 2);
                        }
                    }
                }
            }
            prev.Save(System.IO.Path.Combine(outDir, "cast_preview.png"), ImageFormat.Png);
            sb.AppendLine("preview saved");
        }

        return sb.ToString();
    }
}
