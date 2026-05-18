import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showHUD,
} from "@raycast/api";
import {
  showFailureToast,
  useCachedPromise,
  useLocalStorage,
} from "@raycast/utils";
import { useRef } from "react";
import {
  Backend,
  checkHealth,
  DEFAULT_SPEED,
  getKokoroServerUrl,
  listSayVoices,
  SayVoice,
  selectedVoiceKey,
  SELECTED_SPEED_KEY,
  speak,
  SPEED_PRESETS,
  stop,
} from "./lib/api";
import {
  DEFAULT_VOICE_ID,
  VOICES as KOKORO_VOICES,
  Voice as KokoroVoice,
} from "./lib/voices";

const PREVIEW_TEXT =
  "Hello — this is what I sound like. The quick brown fox jumps over the lazy dog.";

export default function Command() {
  const abortable = useRef<AbortController>(new AbortController());

  // Two per-backend default voices (separate keys so each backend has its own
  // preferred voice that doesn't get clobbered when the user switches backend).
  const {
    value: kokoroDefault,
    setValue: setKokoroDefault,
    isLoading: kokoroDefaultLoading,
  } = useLocalStorage<string>(selectedVoiceKey("kokoro"), DEFAULT_VOICE_ID);

  const {
    value: sayDefault,
    setValue: setSayDefault,
    isLoading: sayDefaultLoading,
  } = useLocalStorage<string>(selectedVoiceKey("say"), "Samantha");

  const {
    value: speed,
    setValue: setSpeed,
    isLoading: speedLoading,
  } = useLocalStorage<number>(SELECTED_SPEED_KEY, DEFAULT_SPEED);

  const {
    data: health,
    isLoading: healthLoading,
    revalidate: revalidateHealth,
  } = useCachedPromise(() => checkHealth(), [], {
    keepPreviousData: true,
    abortable,
  });

  const { data: sayVoices = [], isLoading: sayVoicesLoading } =
    useCachedPromise(() => listSayVoices(), [], { keepPreviousData: true });

  const isLoading =
    kokoroDefaultLoading ||
    sayDefaultLoading ||
    speedLoading ||
    healthLoading ||
    sayVoicesLoading;

  const kokoroReachable =
    health?.kokoro.ok === true && health.kokoro.status === "ok";
  const kokoroLoading =
    health?.kokoro.ok === false && health.kokoro.status === "loading";
  const sayAvailable = health?.sayAvailable === true;
  const activeBackend = health?.active ?? "say";

  async function preview(voice: string, backend: Backend) {
    try {
      await speak(PREVIEW_TEXT, { voice, voiceBackend: backend, speed });
    } catch (e) {
      await showFailureToast(e, {
        title: "Preview failed",
        primaryAction: {
          title: "Open Preferences",
          onAction: () => openExtensionPreferences(),
        },
      });
    }
  }

  async function setDefault(
    backend: Backend,
    voiceId: string,
    displayName: string,
  ) {
    if (backend === "kokoro") await setKokoroDefault(voiceId);
    else await setSayDefault(voiceId);
    await showHUD(`✨  Default ${backend} voice: ${displayName}`);
  }

  async function changeSpeed(value: string) {
    const n = parseFloat(value);
    if (isFinite(n)) await setSpeed(n);
  }

  async function stopAll() {
    try {
      await stop();
      await showHUD("🔇  Stopped");
    } catch (e) {
      await showFailureToast(e, { title: "Couldn't stop playback" });
    }
  }

  // English say voices grouped by tier
  const englishSayVoices = sayVoices
    .filter((v) => v.locale.startsWith("en_"))
    .sort((a, b) => {
      const tierOrder = { premium: 0, enhanced: 1, standard: 2 };
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      return t !== 0 ? t : a.name.localeCompare(b.name);
    });

  // Non-English say voices
  const otherSayVoices = sayVoices
    .filter((v) => !v.locale.startsWith("en_"))
    .sort(
      (a, b) =>
        a.language.localeCompare(b.language) || a.name.localeCompare(b.name),
    );

  const statusLabel = (() => {
    if (kokoroLoading)
      return `Kokoro loading model · ${speed ?? DEFAULT_SPEED}×`;
    const backendLabel = activeBackend === "kokoro" ? "Kokoro" : "macOS";
    const statusBit = kokoroReachable
      ? "Kokoro ready"
      : sayAvailable
        ? "Kokoro offline"
        : "no backend";
    return `${backendLabel} · ${statusBit} · ${speed ?? DEFAULT_SPEED}×`;
  })();

  const showBothEmpty = !kokoroReachable && !sayAvailable && !isLoading;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search voices…"
      navigationTitle={`Voices — ${statusLabel}`}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Default speech speed"
          value={String(speed ?? DEFAULT_SPEED)}
          onChange={changeSpeed}
          storeValue={false}
        >
          {SPEED_PRESETS.map((s) => (
            <List.Dropdown.Item
              key={s}
              title={`${s}× speed`}
              value={String(s)}
            />
          ))}
        </List.Dropdown>
      }
    >
      {showBothEmpty ? (
        <List.EmptyView
          icon={{ source: Icon.Plug, tintColor: Color.Red }}
          title="No TTS backend available"
          description="The Kokoro server isn't reachable and the macOS `say` command isn't responding."
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                onAction={revalidateHealth}
              />
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {kokoroReachable && (
            <>
              <List.Section
                title="Kokoro · Female"
                subtitle={`${getKokoroServerUrl()}`}
              >
                {KOKORO_VOICES.filter((v) => v.gender === "female").map((v) => (
                  <KokoroVoiceRow
                    key={v.id}
                    voice={v}
                    selected={v.id === (kokoroDefault ?? DEFAULT_VOICE_ID)}
                    onPreview={() => preview(v.id, "kokoro")}
                    onChoose={() => setDefault("kokoro", v.id, v.name)}
                    onStop={stopAll}
                    onRefresh={revalidateHealth}
                  />
                ))}
              </List.Section>
              <List.Section title="Kokoro · Male">
                {KOKORO_VOICES.filter((v) => v.gender === "male").map((v) => (
                  <KokoroVoiceRow
                    key={v.id}
                    voice={v}
                    selected={v.id === (kokoroDefault ?? DEFAULT_VOICE_ID)}
                    onPreview={() => preview(v.id, "kokoro")}
                    onChoose={() => setDefault("kokoro", v.id, v.name)}
                    onStop={stopAll}
                    onRefresh={revalidateHealth}
                  />
                ))}
              </List.Section>
            </>
          )}

          {!kokoroReachable && sayAvailable && (
            <List.Section title="Kokoro server" subtitle="not running">
              <List.Item
                title="Kokoro server is offline"
                subtitle={`Tried ${getKokoroServerUrl()}`}
                icon={{ source: Icon.Plug, tintColor: Color.SecondaryText }}
                accessories={[
                  { tag: { value: "premium upgrade", color: Color.Orange } },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="Recheck"
                      icon={Icon.ArrowClockwise}
                      shortcut={Keyboard.Shortcut.Common.Refresh}
                      onAction={revalidateHealth}
                    />
                    <Action
                      title="Open Extension Preferences"
                      icon={Icon.Gear}
                      onAction={openExtensionPreferences}
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          )}

          {sayAvailable && englishSayVoices.length > 0 && (
            <List.Section
              title="macOS · English"
              subtitle="installed system voices"
            >
              {englishSayVoices.map((v) => (
                <SayVoiceRow
                  key={`${v.id}-${v.locale}`}
                  voice={v}
                  selected={v.id === (sayDefault ?? "Samantha")}
                  onPreview={() => preview(v.id, "say")}
                  onChoose={() => setDefault("say", v.id, v.name)}
                  onStop={stopAll}
                  onRefresh={revalidateHealth}
                />
              ))}
            </List.Section>
          )}

          {sayAvailable && otherSayVoices.length > 0 && (
            <List.Section title="macOS · Other languages">
              {otherSayVoices.map((v) => (
                <SayVoiceRow
                  key={`${v.id}-${v.locale}`}
                  voice={v}
                  selected={v.id === (sayDefault ?? "Samantha")}
                  onPreview={() => preview(v.id, "say")}
                  onChoose={() => setDefault("say", v.id, v.name)}
                  onStop={stopAll}
                  onRefresh={revalidateHealth}
                />
              ))}
            </List.Section>
          )}
        </>
      )}
    </List>
  );
}

function KokoroVoiceRow({
  voice,
  selected,
  onPreview,
  onChoose,
  onStop,
  onRefresh,
}: {
  voice: KokoroVoice;
  selected: boolean;
  onPreview: () => void;
  onChoose: () => void;
  onStop: () => void;
  onRefresh: () => void;
}) {
  return (
    <List.Item
      title={voice.name}
      subtitle={voice.description}
      icon={
        selected
          ? { source: Icon.CheckCircle, tintColor: Color.Green }
          : { source: Icon.SpeakerOn, tintColor: Color.SecondaryText }
      }
      accessories={[
        { tag: { value: voice.id, color: Color.Purple } },
        selected
          ? {
              icon: { source: Icon.Star, tintColor: Color.Yellow },
              tooltip: "Default Kokoro voice",
            }
          : {},
      ].filter((a) => Object.keys(a).length > 0)}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Preview" icon={Icon.Play} onAction={onPreview} />
            <Action
              title="Set as Default Kokoro Voice"
              icon={Icon.Star}
              shortcut={Keyboard.Shortcut.Common.Save}
              onAction={onChoose}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Stop Playback"
              icon={Icon.SpeakerOff}
              shortcut={{ modifiers: ["cmd"], key: "." }}
              onAction={onStop}
            />
            <Action.CopyToClipboard
              title="Copy Voice ID"
              content={voice.id}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Recheck Server"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={onRefresh}
            />
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function SayVoiceRow({
  voice,
  selected,
  onPreview,
  onChoose,
  onStop,
  onRefresh,
}: {
  voice: SayVoice;
  selected: boolean;
  onPreview: () => void;
  onChoose: () => void;
  onStop: () => void;
  onRefresh: () => void;
}) {
  const tierColor =
    voice.tier === "premium"
      ? Color.Green
      : voice.tier === "enhanced"
        ? Color.Blue
        : Color.SecondaryText;
  return (
    <List.Item
      title={voice.name}
      subtitle={voice.sample}
      icon={
        selected
          ? { source: Icon.CheckCircle, tintColor: Color.Green }
          : { source: Icon.Person, tintColor: tierColor }
      }
      accessories={[
        { tag: { value: voice.locale, color: Color.SecondaryText } },
        voice.tier !== "standard"
          ? { tag: { value: voice.tier, color: tierColor } }
          : {},
        selected
          ? {
              icon: { source: Icon.Star, tintColor: Color.Yellow },
              tooltip: "Default macOS voice",
            }
          : {},
      ].filter((a) => Object.keys(a).length > 0)}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Preview" icon={Icon.Play} onAction={onPreview} />
            <Action
              title="Set as Default macOS Voice"
              icon={Icon.Star}
              shortcut={Keyboard.Shortcut.Common.Save}
              onAction={onChoose}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Stop Playback"
              icon={Icon.SpeakerOff}
              shortcut={{ modifiers: ["cmd"], key: "." }}
              onAction={onStop}
            />
            <Action.CopyToClipboard
              title="Copy Voice Name"
              content={voice.id}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Recheck Backends"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={onRefresh}
            />
            <Action
              title="Open Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
