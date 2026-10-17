package app.lovable.multicampov;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MultiCamNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
