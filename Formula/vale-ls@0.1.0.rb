class ValeLsAT0_1_0 < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.1.0"
  license "MIT"

  keg_only :versioned_formula

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "6cf00d8193fe392196cd19685b711ba19c9a5dd609bf4ada73d2a4fab21070a1"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "9956ce9a574b1fd0559a48fee6b6f7dcd18415d0c30edccdf1d14a6caa98c7c8"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "99fbcfe0084908052ea3fc6cfadb943b483b457a4e249d35353b7dd7439d7cb3"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "61982834be55bb4572232f5c7e0e7e005f24aac88c0e245ee3a2e649d118d8fc"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
