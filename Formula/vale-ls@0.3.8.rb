class ValeLsAT0_3_8 < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.3.8"
  license "MIT"

  keg_only :versioned_formula

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "3b3c79d8d4f16296f94737cfdfff301386c8791fb122f3f55da63758d2eb1f07"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "a641bcfe4380a3023866a0a5b60ccf494273f3388f64802cc608ffde0cc772ec"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "839e0d43513b08158f9832abfbd4ef1324d382065b521b210452397410409d60"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "7e76fcb0db09e264b1637bcc72d01b3c1c7c3cff7d743aa193ccf5d08df911cf"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
