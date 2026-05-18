import { openExtensionPreferences, showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { speak } from "./lib/api";
import { captureSelection, truncateForHUD } from "./lib/selection";

export default async function Command() {
  const text = await captureSelection();

  if (!text) {
    await showHUD("🔇  Nothing selected");
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
