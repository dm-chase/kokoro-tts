import {
  Action,
  ActionPanel,
  Form,
  Icon,
  openExtensionPreferences,
  popToRoot,
  showHUD,
} from "@raycast/api";
import {
  FormValidation,
  showFailureToast,
  useCachedPromise,
  useForm,
  useLocalStorage,
} from "@raycast/utils";
import {
  Backend,
  checkHealth,
  DEFAULT_SPEED,
  getActiveBackend,
  listSayVoices,
  selectedVoiceKey,
  SELECTED_SPEED_KEY,
  speak,
  SPEED_PRESETS,
} from "./lib/api";
import { DEFAULT_VOICE_ID, VOICES as KOKORO_VOICES } from "./lib/voices";

interface FormValues {
  text: string;
  /** Encoded as "backend:voiceId" so one dropdown drives both backend + voice. */
  voice: string;
  speed: string;
  clean: boolean;
}

function encodeVoice(backend: Backend, voiceId: string): string {
  return `${backend}:${voiceId}`;
}

function decodeVoice(encoded: string): { backend: Backend; voiceId: string } {
  const idx = encoded.indexOf(":");
  if (idx < 0) return { backend: "say", voiceId: encoded };
  const backend = encoded.slice(0, idx) as Backend;
  const voiceId = encoded.slice(idx + 1);
  return { backend, voiceId };
}

export default function Command() {
  const { value: kokoroDefault, isLoading: kokoroDefaultLoading } = useLocalStorage<string>(
    selectedVoiceKey("kokoro"),
    DEFAULT_VOICE_ID,
  );
  const { value: sayDefault, isLoading: sayDefaultLoading } = useLocalStorage<string>(
    selectedVoiceKey("say"),
    "Samantha",
  );
  const { value: defaultSpeed, isLoading: speedLoading } = useLocalStorage<number>(
    SELECTED_SPEED_KEY,
    DEFAULT_SPEED,
  );

  const { data: health, isLoading: healthLoading } = useCachedPromise(() => checkHealth(), [], {
    keepPreviousData: true,
  });
  const { data: sayVoices = [], isLoading: sayVoicesLoading } = useCachedPromise(
    () => listSayVoices(),
    [],
    { keepPreviousData: true },
  );
  const { data: activeBackend, isLoading: activeBackendLoading } = useCachedPromise(
    () => getActiveBackend(),
    [],
    { keepPreviousData: true },
  );

  const kokoroReachable = health?.kokoro.ok === true && health.kokoro.status === "ok";
  const englishSayVoices = sayVoices
    .filter((v) => v.locale.startsWith("en_"))
    .sort((a, b) => {
      const tierOrder = { premium: 0, enhanced: 1, standard: 2 };
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      return t !== 0 ? t : a.name.localeCompare(b.name);
    });

  // Initial dropdown value: encoded default voice for whichever backend is active.
  const initialVoiceEncoded = (() => {
    if (activeBackend === "kokoro" && kokoroReachable) {
      return encodeVoice("kokoro", kokoroDefault ?? DEFAULT_VOICE_ID);
    }
    return encodeVoice("say", sayDefault ?? "Samantha");
  })();

  const { handleSubmit, itemProps } = useForm<FormValues>({
    onSubmit: async (values) => {
      const { backend, voiceId } = decodeVoice(values.voice);
      try {
        await speak(values.text, {
          voice: voiceId,
          voiceBackend: backend,
          speed: parseFloat(values.speed),
          clean: values.clean,
        });
        await showHUD(`🔊  Speaking @ ${values.speed}×`);
        await popToRoot();
      } catch (e) {
        await showFailureToast(e, {
          title: "Couldn't speak",
          primaryAction: { title: "Open Preferences", onAction: () => openExtensionPreferences() },
        });
      }
    },
    validation: {
      text: FormValidation.Required,
      voice: FormValidation.Required,
      speed: FormValidation.Required,
    },
    initialValues: {
      text: "",
      voice: initialVoiceEncoded,
      speed: String(defaultSpeed ?? DEFAULT_SPEED),
      clean: true,
    },
  });

  const isLoading =
    kokoroDefaultLoading ||
    sayDefaultLoading ||
    speedLoading ||
    healthLoading ||
    sayVoicesLoading ||
    activeBackendLoading;

  return (
    <Form
      isLoading={isLoading}
      enableDrafts
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Speak" icon={Icon.SpeakerOn} onSubmit={handleSubmit} />
          <Action
            title="Open Extension Preferences"
            icon={Icon.Gear}
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        title="Text"
        placeholder="Type or paste text to read aloud"
        autoFocus
        enableMarkdown={false}
        {...itemProps.text}
      />
      <Form.Dropdown title="Voice" {...itemProps.voice}>
        {kokoroReachable && (
          <>
            <Form.Dropdown.Section title="Kokoro · Female">
              {KOKORO_VOICES.filter((v) => v.gender === "female").map((v) => (
                <Form.Dropdown.Item
                  key={`kokoro-${v.id}`}
                  value={encodeVoice("kokoro", v.id)}
                  title={`${v.name} — ${v.description}`}
                />
              ))}
            </Form.Dropdown.Section>
            <Form.Dropdown.Section title="Kokoro · Male">
              {KOKORO_VOICES.filter((v) => v.gender === "male").map((v) => (
                <Form.Dropdown.Item
                  key={`kokoro-${v.id}`}
                  value={encodeVoice("kokoro", v.id)}
                  title={`${v.name} — ${v.description}`}
                />
              ))}
            </Form.Dropdown.Section>
          </>
        )}
        <Form.Dropdown.Section title="macOS · English">
          {englishSayVoices.map((v) => (
            <Form.Dropdown.Item
              key={`say-${v.id}-${v.locale}`}
              value={encodeVoice("say", v.id)}
              title={v.tier === "standard" ? v.name : `${v.name} — ${v.tier}`}
            />
          ))}
        </Form.Dropdown.Section>
      </Form.Dropdown>
      <Form.Dropdown title="Speed" {...itemProps.speed}>
        {SPEED_PRESETS.map((s) => (
          <Form.Dropdown.Item key={s} value={String(s)} title={`${s}× speed`} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        label="Strip markdown, code fences, and URLs before speaking"
        {...itemProps.clean}
      />
    </Form>
  );
}
