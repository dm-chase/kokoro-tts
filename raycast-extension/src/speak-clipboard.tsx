import { Clipboard, openExtensionPreferences, showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { speak } from "./lib/api";
import { truncateForHUD } from "./lib/selection";

export default async function Command() {
  const text = await Clipboard.readText();
  if (!text || !text.trim()) {
    await showHUD("📋  Clipboard is empty");
    return;
  }

  try {
    await speak(text);
    await showHUD(`🔊  ${truncateForHUD(text)}`);
  } catch (e) {
    await showFailureToast(e, {
      title: "Couldn't reach Kokoro server",
      primaryAction: {
        title: "Open Preferences",
        onAction: () => openExtensionPreferences(),
      },
    });
  }
}
