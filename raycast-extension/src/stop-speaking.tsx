import { showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { stop } from "./lib/api";

export default async function Command() {
  try {
    await stop();
    await showHUD("🔇  Stopped");
  } catch (e) {
    await showFailureToast(e, { title: "Couldn't stop playback" });
  }
}
