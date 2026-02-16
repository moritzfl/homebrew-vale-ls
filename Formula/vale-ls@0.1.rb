class ValeLsAT0_1 < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.1.1"
  license "MIT"

  livecheck do
    url "https://github.com/errata-ai/vale-ls/releases"
    strategy :github_releases
    regex(/^v?0\.1\.\d+$/i)
  end
  keg_only :versioned_formula

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "04641b13490ce667bbe8f5078aa7521f71f572da67bfddedd4dbe8a41f313b0f"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "72b174f80e33edc8438383f0efbeb804e745b830079d664b9812ae07f8bb96a2"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "f2a88ce43c32797c14712aa23b1b6b00a6ac93c28f1aeacd164d4f916dc1a4ff"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "8a4fd5cab05d4a03e00a1ce67d2ae95c32781a96661445ddf6abe8e609a6365d"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
