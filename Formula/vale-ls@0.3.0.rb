class ValeLsAT0_3_0 < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.3.0"
  license "MIT"

  keg_only :versioned_formula

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "05e32a35b0a2f468a5d7b8faa0e933096fc632c652a065f20ac1e2029769b789"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "84dfb17135eaef7df26d6078e58d9d17c38353e02a46a311371dfd1e1da62982"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "1248666c4dc6561bba047b753c571c6c0475b7328433d2bb6975411cd2e38d2a"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "b74b606adb2cec91a747e49c2281964b6dcbeccb9fdcc6f295c6c8900fdc9953"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
