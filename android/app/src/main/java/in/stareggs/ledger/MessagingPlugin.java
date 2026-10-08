package in.stareggs.ledger;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Invoice PDFs on Android: write the file, save it to Downloads, share it,
 * send it straight into a seller's WhatsApp chat, and open the SMS app with a bill summary.
 */
@CapacitorPlugin(name = "Messaging")
public class MessagingPlugin extends Plugin {

    private static final String WHATSAPP = "com.whatsapp";
    private static final String WHATSAPP_BUSINESS = "com.whatsapp.w4b";

    @PluginMethod
    public void apps(PluginCall call) {
        JSObject res = new JSObject();
        res.put("whatsapp", isInstalled(WHATSAPP));
        res.put("business", isInstalled(WHATSAPP_BUSINESS));
        call.resolve(res);
    }

    /** name: file name, data: base64 PDF. Writes to the app cache and returns its absolute path. */
    @PluginMethod
    public void writePdf(PluginCall call) {
        String name = safeName(call.getString("name", "invoice.pdf"));
        String data = call.getString("data", "");
        try {
            File dir = new File(getContext().getCacheDir(), "invoices");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create folder");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            JSObject res = new JSObject();
            res.put("path", file.getAbsolutePath());
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not write the PDF: " + e.getMessage(), "WRITE_FAILED");
        }
    }

    /** Saves the PDF to Downloads/Star Eggs and opens it in the phone's PDF viewer. */
    @PluginMethod
    public void savePdf(PluginCall call) {
        String name = safeName(call.getString("name", "invoice.pdf"));
        byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
        try {
            Uri uri;
            String where;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Star Eggs");
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Downloads not available");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new Exception("cannot open file");
                    out.write(bytes);
                }
                where = "Downloads/Star Eggs/" + name;
            } else {
                File dir = new File(getContext().getExternalFilesDir(null), "Invoices");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create folder");
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                where = "Star Eggs app files/Invoices/" + name;
            }
            boolean opened = false;
            try {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(uri, "application/pdf");
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(view);
                opened = true;
            } catch (ActivityNotFoundException ignored) {
                // No PDF viewer installed; the file is still saved.
            }
            JSObject res = new JSObject();
            res.put("where", where);
            res.put("opened", opened);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not save the PDF: " + e.getMessage(), "SAVE_FAILED");
        }
    }

    /** Opens Android's share menu with the PDF attached. path: absolute path from writePdf. */
    @PluginMethod
    public void share(PluginCall call) {
        try {
            Uri content = contentUri(call.getString("path", ""));
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/pdf");
            send.putExtra(Intent.EXTRA_STREAM, content);
            String text = call.getString("text", "");
            if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", "Send invoice"));
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open sharing: " + e.getMessage(), "SHARE_FAILED");
        }
    }

    /** path: absolute path from writePdf. phone: digits with country code. prefer: "business" | "whatsapp" | "auto". */
    @PluginMethod
    public void whatsappFile(PluginCall call) {
        String path = call.getString("path", "");
        String phone = call.getString("phone", "").replaceAll("[^0-9]", "");
        String text = call.getString("text", "");
        String prefer = call.getString("prefer", "auto");

        String pkg = pickWhatsApp(prefer);
        if (pkg == null) {
            call.reject("WhatsApp is not installed", "NOT_INSTALLED");
            return;
        }
        try {
            Uri content = contentUri(path);

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/pdf");
            intent.setPackage(pkg);
            intent.putExtra(Intent.EXTRA_STREAM, content);
            if (!text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
            if (!phone.isEmpty()) intent.putExtra("jid", phone + "@s.whatsapp.net");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().grantUriPermission(pkg, content, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);

            JSObject res = new JSObject();
            res.put("app", pkg.equals(WHATSAPP_BUSINESS) ? "business" : "whatsapp");
            call.resolve(res);
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp is not installed", "NOT_INSTALLED");
        } catch (Exception e) {
            call.reject("Could not open WhatsApp: " + e.getMessage(), "FAILED");
        }
    }

    /** Opens the phone's SMS app with the number and message filled in. */
    @PluginMethod
    public void sms(PluginCall call) {
        String phone = call.getString("phone", "").replaceAll("[^0-9+]", "");
        String text = call.getString("text", "");
        try {
            Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + phone));
            intent.putExtra("sms_body", text);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No SMS app found", "NO_SMS_APP");
        } catch (Exception e) {
            call.reject("Could not open SMS: " + e.getMessage(), "FAILED");
        }
    }

    private Uri contentUri(String path) {
        String p = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new File(p));
    }

    private static String safeName(String name) {
        String n = name.replaceAll("[^A-Za-z0-9._-]", "-");
        return n.toLowerCase().endsWith(".pdf") ? n : n + ".pdf";
    }

    private String pickWhatsApp(String prefer) {
        boolean normal = isInstalled(WHATSAPP);
        boolean business = isInstalled(WHATSAPP_BUSINESS);
        if ("whatsapp".equals(prefer) && normal) return WHATSAPP;
        if ("business".equals(prefer) && business) return WHATSAPP_BUSINESS;
        if (business) return WHATSAPP_BUSINESS;
        if (normal) return WHATSAPP;
        return null;
    }

    private boolean isInstalled(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
