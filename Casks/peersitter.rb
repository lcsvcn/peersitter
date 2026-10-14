cask "peersitter" do
  version "0.1.0"
  sha256 :no_check # replaced with the real checksum by .github/workflows/release-macos.yml

  url "https://github.com/lcsvcn/peersitter/releases/download/v#{version}/PeerSitter-#{version}-macos.zip"
  name "PeerSitter"
  desc "Open-source, peer-to-peer camera monitoring with Apple Home (HomeKit) support"
  homepage "https://github.com/lcsvcn/peersitter"

  # Needed only for the optional HomeKit camera mode (not bundled in the app).
  depends_on formula: ["ffmpeg", "node"]
  depends_on :macos

  app "PeerSitter.app"

  zap trash: [
    "~/Library/Application Support/PeerSitter",
    "~/Library/Caches/dev.peersitter.desktop",
    "~/Library/WebKit/dev.peersitter.desktop",
  ]

  caveats <<~EOS
    PeerSitter is not signed with an Apple Developer ID. If macOS refuses to open it:
      xattr -dr com.apple.quarantine "#{appdir}/PeerSitter.app"
    (or right-click the app → Open once).

    The Apple Home (HomeKit) camera mode uses the node and ffmpeg formulae, installed
    alongside as dependencies.
  EOS
end
