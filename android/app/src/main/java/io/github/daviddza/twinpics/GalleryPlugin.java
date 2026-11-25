package io.github.daviddza.twinpics;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.view.WindowManager;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONException;

/** La galerie, pour l'interface (src/platform/android.ts). Une seule question d'Android à la fois. */
@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {

    private ActivityResultLauncher<String[]> askAccess;
    private ActivityResultLauncher<IntentSenderRequest> askTrash;
    private PluginCall accessCall;
    private PluginCall trashCall;
    private JSArray missing = new JSArray();

    @Override
    public void load() {
        askAccess = bridge.registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), results -> {
            PluginCall call = accessCall;
            accessCall = null;
            if (call != null) call.resolve(accessResult());
        });
        askTrash = bridge.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = trashCall;
            trashCall = null;
            if (call != null) call.resolve(trashResult(result.getResultCode() != Activity.RESULT_OK));
        });
    }

    private JSObject accessResult() {
        JSObject out = new JSObject();
        out.put("access", Gallery.access(getContext()));
        return out;
    }

    private JSObject trashResult(boolean cancelled) {
        JSObject out = new JSObject();
        out.put("cancelled", cancelled);
        out.put("missing", missing);
        return out;
    }

    @PluginMethod
    public void access(PluginCall call) {
        call.resolve(accessResult());
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (accessCall != null) {
                call.reject("busy");
                return;
            }
            accessCall = call;
            askAccess.launch(Gallery.permissions());
        });
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray photos = new JSArray();
        try {
            for (Gallery.Photo p : Gallery.list(getContext())) {
                JSObject o = new JSObject();
                o.put("id", p.id);
                o.put("path", p.path);
                o.put("size", p.size);
                o.put("lastModified", p.lastModified);
                photos.put(o);
            }
        } catch (RuntimeException e) {
            call.reject(String.valueOf(e.getMessage()));
            return;
        }
        JSObject out = new JSObject();
        out.put("photos", photos);
        call.resolve(out);
    }

    /** Met des photos à la corbeille du téléphone (trashed) ou les en sort : Android demande confirmation. */
    @PluginMethod
    public void trash(PluginCall call) {
        boolean trashed = Boolean.TRUE.equals(call.getBoolean("trashed", true));
        List<Long> ids = new ArrayList<>();
        JSArray gone = new JSArray();
        try {
            JSArray asked = call.getArray("ids", new JSArray());
            for (int i = 0; i < asked.length(); i++) ids.add(asked.getLong(i));
            if (trashed) {
                Set<Long> here = Gallery.existing(getContext(), ids);
                for (Long id : ids) if (!here.contains(id)) gone.put(id.longValue());
                ids.removeIf(id -> !here.contains(id));
            }
        } catch (JSONException | RuntimeException e) {
            call.reject(String.valueOf(e.getMessage()));
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (trashCall != null) {
                call.reject("busy");
                return;
            }
            missing = gone;
            if (ids.isEmpty()) {
                call.resolve(trashResult(false));
                return;
            }
            try {
                trashCall = call;
                askTrash.launch(new IntentSenderRequest.Builder(Gallery.trashRequest(getContext(), ids, trashed).getIntentSender()).build());
            } catch (RuntimeException e) {
                trashCall = null;
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    /** Écran allumé pendant l'analyse : éteint, Android mettrait la page en pause. */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    /** Les réglages d'Android pour l'appli (autorisation refusée : Android ne la redemande plus). */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri));
        call.resolve();
    }
}
