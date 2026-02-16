class ValeLsAT0_3_6 < Formula
  desc "Language Server Protocol implementation for Vale"
  homepage "https://github.com/errata-ai/vale-ls"
  version "0.3.6"
  license "MIT"

  keg_only :versioned_formula

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-apple-darwin.zip"
      sha256 "8c5f4a96cfbabf464101bc358dd57cf86516ded1ad81b17dbae4c2047f3ad523"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-apple-darwin.zip"
      sha256 "9dcb74bb1c75ff0500ed1f20e5e7e6d83b071b1271e0e07becaf00ec1e5752f3"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-aarch64-unknown-linux-gnu.zip"
      sha256 "4dd8916571b975bd2ec6a326567324b4cc92985db6b42c16df4c2d1cf5887c2d"
    else
      url "https://github.com/errata-ai/vale-ls/releases/download/v#{version}/vale-ls-x86_64-unknown-linux-gnu.zip"
      sha256 "f4fb6ad63e1c4f64c6e2fa7b917d3182c60dcffd12125ada26897cbddadbbf01"
    end
  end

  def install
    bin.install "vale-ls"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vale-ls --version")
  end
end
