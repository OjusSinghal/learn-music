# Keep JavascriptInterface bridge methods intact under R8/ProGuard
-keepattributes JavascriptInterface
-keepclassmembers class com.ojussinghal.learnmusic.AndroidJsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.ojussinghal.learnmusic.AndroidJsBridge { *; }

