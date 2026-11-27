import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val repoRootDir = rootProject.projectDir.parentFile
val generatedWebAssetsDir = layout.buildDirectory.dir("generated/webAssets")
val keystorePropsFile = File(rootProject.projectDir, "keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        keystorePropsFile.inputStream().use { load(it) }
    }
}

val releaseStorePath: String? = System.getenv("LEARN_MUSIC_KEYSTORE_PATH")
    ?: keystoreProps.getProperty("storeFile")
val releaseStorePassword: String? = System.getenv("LEARN_MUSIC_KEYSTORE_PASSWORD")
    ?: keystoreProps.getProperty("storePassword")
val releaseKeyAlias: String? = System.getenv("LEARN_MUSIC_KEY_ALIAS")
    ?: keystoreProps.getProperty("keyAlias")
val releaseKeyPassword: String? = System.getenv("LEARN_MUSIC_KEY_PASSWORD")
    ?: keystoreProps.getProperty("keyPassword")
val hasReleaseSigning = !releaseStorePath.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank() &&
    File(releaseStorePath).exists()

val syncWebAssets by tasks.registering(Sync::class) {
    description = "Syncs the single-source-of-truth web app assets into APK assets/www"
    into(generatedWebAssetsDir.map { it.dir("www") })

    from(repoRootDir) {
        include("index.html")
        include("style.css")
    }
    from(File(repoRootDir, "js")) {
        into("js")
    }
    from(File(repoRootDir, "assets")) {
        into("assets")
    }
    from(File(repoRootDir, "songs_data")) {
        into("songs_data")
        include("*.json")
    }
    from(File(repoRootDir, "samples")) {
        into("samples")
    }
    from(File(repoRootDir, "audio_dataset")) {
        into("audio_dataset")
        include("calibrated_profile.json")
    }
}

android {
    namespace = "com.ojussinghal.learnmusic"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ojussinghal.learnmusic"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        setProperty("archivesBaseName", "learn-music")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = File(releaseStorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            isDebuggable = true
        }
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(generatedWebAssetsDir)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.webkit:webkit:1.11.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
