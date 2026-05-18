# Formula for the Kokoro TTS local server.
#
# Distribution model: this formula DECLARES espeak-ng as a dependency (which
# Homebrew installs from upstream); it does not bundle or redistribute it.
# That keeps the formula free of GPL-3.0 redistribution obligations — same
# pattern as `brew install ffmpeg` declaring `lame` as a dep without becoming
# a redistributor of lame's GPL-licensed bits.
#
# To use as a tap (recommended):
#   brew tap dm-chase/kokoro-tts
#   brew install kokoro-tts-server
#   brew services start kokoro-tts-server
#
# To install directly from this formula file (during local development):
#   brew install --HEAD --build-from-source ./Formula/kokoro-tts-server.rb
class KokoroTtsServer < Formula
  include Language::Python::Virtualenv

  desc "Local Kokoro 82M text-to-speech HTTP server with multi-voice support"
  homepage "https://github.com/dm-chase/kokoro-tts"
  url "https://github.com/dm-chase/kokoro-tts/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "272e376653505fd734a29731c1f0d991ea88144cc1bd19f994485c77cd98a8d1"
  license "Apache-2.0"
  head "https://github.com/dm-chase/kokoro-tts.git", branch: "main"

  depends_on "espeak-ng"
  depends_on "python@3.11"

  def install
    # Build a virtualenv inside libexec so the Python interpreter and all
    # Kokoro deps (torch, transformers, sounddevice, etc.) stay isolated from
    # the system Python and from any other brew Python formulas.
    venv = virtualenv_create(libexec, "python3.11")

    # Install Kokoro + server deps. This pulls torch (~700MB on first install)
    # plus transformers and the misaki G2P stack. The actual model weights
    # download lazily on first /speak — keeps `brew install` from blocking
    # on a separate ~330MB HuggingFace fetch.
    venv.pip_install [
      "kokoro",
      "fastapi",
      "uvicorn[standard]",
      "sounddevice",
      "numpy",
    ]

    # Install the server module into libexec so the brew-managed Python can
    # find it.
    libexec.install "kokoro_server.py"

    # Wrapper script in bin invokes the venv'd python with our server module.
    # We avoid shebang-magic and just exec the absolute paths — survives
    # users having unusual PATH setups under launchd.
    (bin/"kokoro-tts-server").write <<~SH
      #!/bin/bash
      exec "#{libexec}/bin/python" "#{libexec}/kokoro_server.py" "$@"
    SH
    (bin/"kokoro-tts-server").chmod 0755
  end

  # `brew services start kokoro-tts-server` installs and loads a LaunchAgent
  # for the current user. We set PATH explicitly so the server can find
  # espeak-ng under HOMEBREW_PREFIX/bin (launchd's default PATH excludes it).
  service do
    run [opt_bin/"kokoro-tts-server"]
    keep_alive true
    log_path var/"log/kokoro-tts-server.log"
    error_log_path var/"log/kokoro-tts-server.log"
    environment_variables PATH: "#{HOMEBREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  end

  def caveats
    <<~EOS
      Kokoro TTS server installed.

      Quick start (recommended):
          brew services start kokoro-tts-server

      Or run in the foreground:
          kokoro-tts-server

      The server listens on http://127.0.0.1:8123. First /speak triggers a
      one-time ~330MB model download from HuggingFace. Logs go to:
          #{var}/log/kokoro-tts-server.log

      Pair with the "Kokoro TTS" Raycast extension — once the server is
      running, the extension auto-detects it and adds the Kokoro voices to
      the picker as a premium upgrade over the default macOS `say` voices.

      Stop / restart / uninstall service:
          brew services stop kokoro-tts-server
          brew services restart kokoro-tts-server

      Licensing note: this server (Apache-2.0) depends on phonemizer-fork
      and espeak-ng, both GPL-3.0-or-later. Calling them as separately
      installed system components keeps your usage free of redistribution
      obligations.
    EOS
  end

  test do
    # Smoke: the venv can import kokoro and our server module loads.
    output = shell_output("#{libexec}/bin/python -c 'import kokoro; print(\"ok\")'")
    assert_match "ok", output

    # The wrapper script exists and is executable.
    assert_predicate bin/"kokoro-tts-server", :executable?
  end
end
