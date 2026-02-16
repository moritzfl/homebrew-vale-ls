class ValeLs < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.4.0"
  license "MIT"

  livecheck do
    url :stable
    strategy :github_latest
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "5f1fb6237eae2db5dea69a1c95867a4eb3e14b42c08e5365db1d1bfad8d44565"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "fe915f2efc5d9be7822e1dedabd2a368ae3eaab39d36aa7c292fc7ee9bb93fee"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "7ac28161d884ec994d4efa8d79f6a1e9d46453f1f6f366b96f5033be793759bd"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "5377a43ab11ef5371fe460e9ff3a5ede826524848c9d73284294451c00bdd3b1"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
