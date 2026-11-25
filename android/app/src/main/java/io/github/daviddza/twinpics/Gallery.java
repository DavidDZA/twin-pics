package io.github.daviddza.twinpics;

import android.Manifest;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.WebResourceResponse;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** La galerie du téléphone (MediaStore) : liste, lecture, corbeille. Sans lien avec Capacitor. */
final class Gallery {

    static final String PHOTO_PATH = "/_photo/";
    private static final String HOST = "localhost";
    private static final Uri IMAGES = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
    private static final int QUERY_IDS = 500;

    private Gallery() {}

    static final class Photo {

        long id;
        String path;
        long size;
        long lastModified;
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** « all » : toutes les photos ; « some » : celles choisies par l'utilisateur (Android 14 et plus) ; « none ». */
    static String access(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return granted(context, Manifest.permission.READ_EXTERNAL_STORAGE) ? "all" : "none";
        }
        if (granted(context, Manifest.permission.READ_MEDIA_IMAGES)) return "all";
        boolean some =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
        return some ? "some" : "none";
    }

    /** Les autorisations à demander, selon la version d'Android. */
    static String[] permissions() {
        List<String> out = new ArrayList<>();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            out.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        } else {
            out.add(Manifest.permission.READ_MEDIA_IMAGES);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            out.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
        }
        out.add(Manifest.permission.ACCESS_MEDIA_LOCATION);
        return out.toArray(new String[0]);
    }

    /** Toutes les images lisibles (mémoire du téléphone et carte SD), hors corbeille. */
    static List<Photo> list(Context context) {
        String[] columns = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.VOLUME_NAME,
            MediaStore.Images.Media.RELATIVE_PATH,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_MODIFIED
        };
        List<Photo> out = new ArrayList<>();
        try (Cursor c = context.getContentResolver().query(IMAGES, columns, null, null, MediaStore.Images.Media._ID)) {
            while (c != null && c.moveToNext()) {
                String name = c.getString(3);
                long size = c.getLong(4);
                if (name == null || size <= 0) continue;
                String volume = c.getString(1);
                String folder = c.getString(2) == null ? "" : c.getString(2);
                if (!folder.isEmpty() && !folder.endsWith("/")) folder += "/";
                // Mémoire du téléphone : « DCIM/Camera/… » ; carte SD : « 1a2b-3c4d/DCIM/Camera/… ».
                boolean primary = volume == null || MediaStore.VOLUME_EXTERNAL_PRIMARY.equals(volume);
                Photo p = new Photo();
                p.id = c.getLong(0);
                p.path = (primary ? "" : volume + "/") + folder + name;
                p.size = size;
                p.lastModified = c.getLong(5) * 1000;
                out.add(p);
            }
        }
        return out;
    }

    /** Réponse à une adresse de photo ; null si ce n'en est pas une. */
    static WebResourceResponse photo(Context context, Uri url) {
        String path = url.getPath();
        if (!HOST.equals(url.getHost()) || path == null || !path.startsWith(PHOTO_PATH)) return null;
        try {
            Uri uri = ContentUris.withAppendedId(IMAGES, Long.parseLong(path.substring(PHOTO_PATH.length())));
            String type = context.getContentResolver().getType(uri);
            InputStream in = open(context, uri);
            if (in == null) throw new IOException("vide");
            Map<String, String> headers = Collections.singletonMap("Cache-Control", "no-cache");
            return new WebResourceResponse(type == null ? "application/octet-stream" : type, null, 200, "OK", headers, in);
        } catch (IOException | RuntimeException e) {
            // Photo disparue, autorisation retirée…
            InputStream empty = new ByteArrayInputStream(new byte[0]);
            return new WebResourceResponse("text/plain", null, 404, "Not Found", Collections.emptyMap(), empty);
        }
    }

    /** Le fichier tel qu'il est (lieu compris) si c'est autorisé, sinon la version sans lieu d'Android. */
    private static InputStream open(Context context, Uri uri) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        if (granted(context, Manifest.permission.ACCESS_MEDIA_LOCATION)) {
            try {
                return resolver.openInputStream(MediaStore.setRequireOriginal(uri));
            } catch (IOException | RuntimeException e) {
                // Refusé : la lecture ordinaire prend le relais.
            }
        }
        return resolver.openInputStream(uri);
    }

    /** Parmi ces photos, celles qui existent encore (Android refuse toute la demande pour une seule disparue). */
    static Set<Long> existing(Context context, List<Long> ids) {
        Set<Long> out = new HashSet<>();
        for (int from = 0; from < ids.size(); from += QUERY_IDS) {
            StringBuilder in = new StringBuilder();
            for (Long id : ids.subList(from, Math.min(ids.size(), from + QUERY_IDS))) {
                if (in.length() > 0) in.append(',');
                in.append(id);
            }
            String where = MediaStore.Images.Media._ID + " IN (" + in + ")";
            String[] columns = { MediaStore.Images.Media._ID };
            try (Cursor c = context.getContentResolver().query(IMAGES, columns, where, null, null)) {
                while (c != null && c.moveToNext()) out.add(c.getLong(0));
            }
        }
        return out;
    }

    /** La demande à l'utilisateur : mettre ces photos à la corbeille du téléphone, ou les en sortir. */
    static PendingIntent trashRequest(Context context, List<Long> ids, boolean trashed) {
        List<Uri> uris = new ArrayList<>();
        for (Long id : ids) uris.add(ContentUris.withAppendedId(IMAGES, id));
        return MediaStore.createTrashRequest(context.getContentResolver(), uris, trashed);
    }
}
