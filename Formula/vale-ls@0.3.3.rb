class ValeLsAT0_3_3 < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.3.3"
  license "MIT"

  keg_only :versioned_formula

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "4e4e4d9e700d81ace9acd0a05fd308ec788f69bd062c1b976eaa352de979d4a0"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "f99af2b66a7f6955614ec079fff0b848a452b4365ed2f43914aa2c92692fbe97"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "10650d7ac94c0911c966fdf5ff3d8c858106567fbcb085fdf6339538992d8a2a"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "441b824aa83c62d23130be88818e0002e77294a1c39ca02b775b506ad59ae6ae"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
