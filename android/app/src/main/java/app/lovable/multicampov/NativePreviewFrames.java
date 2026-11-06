package app.lovable.multicampov;

import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.media.Image;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/** Short, bounded Camera2 preview JPEG frames for the foreground WebView.
 * This surface is owned by NativeCaptureService, not Activity or WebView.
 * It never stores images on disk or accesses the network.
 */
final class NativePreviewFrames {
    private NativePreviewFrames() {}

    static String compressYuv420(Image image) {
        if (image == null || image.getFormat() != ImageFormat.YUV_420_888) return null;
        int width = image.getWidth(), height = image.getHeight();
        if (width < 2 || height < 2 || width > 640 || height > 480 ||
            (width & 1) != 0 || (height & 1) != 0) return null;
        Image.Plane[] planes = image.getPlanes();
        if (planes.length < 3) return null;
        byte[] nv21 = new byte[width * height * 3 / 2];
        ByteBuffer y = planes[0].getBuffer().duplicate();
        int ys = planes[0].getRowStride(), yp = planes[0].getPixelStride();
        ByteBuffer u = planes[1].getBuffer().duplicate(), v = planes[2].getBuffer().duplicate();
        int us = planes[1].getRowStride(), up = planes[1].getPixelStride();
        int vs = planes[2].getRowStride(), vp = planes[2].getPixelStride();
        int yOffset = y.position(), uOffset = u.position(), vOffset = v.position();
        // A source may contain padding at the end of each row.
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                nv21[row * width + col] = y.get(yOffset + row * ys + col * yp);
            }
        }
        int offset = width * height;
        for (int row = 0; row < height / 2; row++) {
            for (int col = 0; col < width / 2; col++) {
                nv21[offset++] = v.get(vOffset + row * vs + col * vp);
                nv21[offset++] = u.get(uOffset + row * us + col * up);
            }
        }
        YuvImage jpeg = new YuvImage(nv21, ImageFormat.NV21, width, height, null);
        ByteArrayOutputStream output = new ByteArrayOutputStream(56_000);
        if (!jpeg.compressToJpeg(new Rect(0, 0, width, height), 55, output)) return null;
        byte[] bytes = output.toByteArray();
        if (bytes.length < 256 || bytes.length > 200_000) return null;
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }
}
