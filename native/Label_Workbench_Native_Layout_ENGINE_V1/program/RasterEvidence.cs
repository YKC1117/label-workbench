using System;
using System.IO;
namespace LabelWorkbench {
    // Reads the BMP emitted by the documented ExportToFile call. No image rewriting.
    // Ink bounds are evidence only: no decoder => no claim of barcode symbol bounds.
    public sealed class RasterStats {
        public int CanvasWidth, CanvasHeight, Left, Top, InkWidth, InkHeight;
        public double HeaderDpiX, HeaderDpiY;
        public long DarkPixels;
    }
    public static class RasterEvidence {
        public static RasterStats Read(string path) {
            byte[] b=File.ReadAllBytes(path);
            if(b.Length<54 || b[0]!=66 || b[1]!=77) throw new InvalidDataException("Not BMP");
            int offset=BitConverter.ToInt32(b,10), dib=BitConverter.ToInt32(b,14);
            int w=BitConverter.ToInt32(b,18), sh=BitConverter.ToInt32(b,22);
            int bits=BitConverter.ToUInt16(b,28), compression=BitConverter.ToInt32(b,30);
            if(dib<40 || w<1 || w>20000 || sh==0 || sh==Int32.MinValue || Math.Abs(sh)>20000 ||
               compression!=0 || (bits!=1 && bits!=24 && bits!=32))
                throw new InvalidDataException("Unsupported BMP layout; measurement NOT VERIFIED");
            int h=Math.Abs(sh), stride=checked(((w*bits+31)/32)*4);
            if(offset<54 || (long)offset+(long)stride*h>b.Length) throw new InvalidDataException("Truncated BMP");
            bool[] darkPalette=new bool[2];
            if(bits==1) {
                int p=14+dib;
                if(p+8>offset) throw new InvalidDataException("Missing mono palette");
                for(int i=0;i<2;i++) darkPalette[i]=(b[p+4*i]+b[p+4*i+1]+b[p+4*i+2])<384;
            }
            int left=w,top=h,right=-1,bottom=-1;long dark=0;
            for(int y=0;y<h;y++) {
                int row=offset+(sh>0?h-1-y:y)*stride;
                for(int x=0;x<w;x++) {
                    bool ink;
                    if(bits==1) ink=darkPalette[(b[row+x/8]>>(7-x%8))&1];
                    else { int q=row+x*(bits/8); ink=(b[q]+b[q+1]+b[q+2])<384; }
                    if(!ink) continue;
                    dark++;left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);
                }
            }
            if(dark==0) throw new InvalidDataException("No dark pixels; blank export");
            return new RasterStats {CanvasWidth=w,CanvasHeight=h,Left=left,Top=top,
                InkWidth=right-left+1,InkHeight=bottom-top+1,DarkPixels=dark,
                HeaderDpiX=BitConverter.ToInt32(b,38)*0.0254, HeaderDpiY=BitConverter.ToInt32(b,42)*0.0254};
        }
    }
}
