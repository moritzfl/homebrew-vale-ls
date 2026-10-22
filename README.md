# vale-ls Homebrew tap

This tap provides Homebrew formulae for installing `vale-ls`.

## Add the tap

```sh
brew tap moritzfl/vale-ls
brew trust moritzfl/vale-ls
```

## Install vale-ls

```sh
brew install vale-ls
```

## Install a specific version

```sh
brew install vale-ls@0.4
```

## Sync formulae with GitHub releases

```sh
bun scripts/sync-tap.ts --prune
```

Requires [Bun](https://bun.sh).

## Check coverage of published releases

```sh
bun scripts/sync-tap.ts --check
```

Exits non-zero when a release is missing a formula or an existing formula is out
of date. CI runs this check weekly.
