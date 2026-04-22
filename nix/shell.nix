_: {
  perSystem =
    {
      pkgs,
      ...
    }:
    {
      devShells = {
        default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            gnumake
            go-jsonnet
            vsce
          ];
        };
      };
    };
}
