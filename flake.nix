{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    actions-nix = {
      url = "github:nialov/actions.nix";
      inputs = {
        flake-parts.follows = "flake-parts";
        nixpkgs.follows = "nixpkgs";
      };
    };
    import-tree.url = "github:vic/import-tree";
    nix-actions.url = "github:koskev/nix-actions";
    grustonnet = {
      url = "github:koskev/grustonnet-ls";
      inputs.nixpkgs.follows = "nixpkgs";
    };

  };
  nixConfig = {
    extra-substituters = [
      "https://koskev.cachix.org"
    ];
    extra-trusted-public-keys = [
      "koskev.cachix.org-1:1EexePRC9DgMPKI01zWTxM9YRIWHBbev15hTUE6h50I="
    ];
  };

  outputs =
    inputs@{ flake-parts, ... }:
    # https://flake.parts/module-arguments.html
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ (inputs.import-tree ./nix) ];
      systems = [
        # systems for which you want to build the `perSystem` attributes
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
    };
}
