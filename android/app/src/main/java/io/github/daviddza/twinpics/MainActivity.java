package io.github.daviddza.twinpics;

import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/** L'appli Android : le site construit (dist/) dans une WebView, et la galerie du téléphone (GalleryPlugin). */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return; // Pas de WebView sur l'appareil.

        paintBackground();
        bridge.setWebViewClient(new Client(bridge));

        // Bouton Retour : la page ferme ce qui est ouvert (src/lib/back.ts) ; sinon, l'appli passe en arrière-plan.
        OnBackPressedCallback back = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                bridge.getWebView().evaluateJavascript("!!(window.twinPicsBack && window.twinPicsBack())", handled -> {
                    if (!"true".equals(handled)) moveTaskToBack(true);
                });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, back);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (bridge != null) paintBackground();
    }

    /** Fond de la fenêtre (sous les barres d'Android) et de la page avant son affichage : clair ou sombre. */
    private void paintBackground() {
        int color = ContextCompat.getColor(this, R.color.window);
        getWindow().getDecorView().setBackgroundColor(color);
        bridge.getWebView().setBackgroundColor(color);
    }

    private class Client extends BridgeWebViewClient {

        Client(Bridge bridge) {
            super(bridge);
        }

        /** Les photos : https://localhost/_photo/numéro, lues dans la galerie. */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse photo = Gallery.photo(MainActivity.this, request.getUrl());
            return photo != null ? photo : super.shouldInterceptRequest(view, request);
        }

        /** Page fermée par Android (mémoire) : on la rouvre au lieu de planter ; ce qui est analysé est en base. */
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            recreate();
            return true;
        }
    }
}
