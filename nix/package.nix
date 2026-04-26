{ self, inputs, ... }:
{
  perSystem =
    {
      pkgs,
      ...
    }:
    {
      packages = {
        default =
          let
            generatedSrc = pkgs.stdenv.mkDerivation {
              name = "generated-package";
              src = self;

              nativeBuildInputs = with pkgs; [
                go-jsonnet
                nodejs
                inputs.grustonnet.packages.${pkgs.stdenv.hostPlatform.system}.default
              ];

              buildPhase = ''
                grustonnet-ls --export-config-schema > grustonnet_schema.json
                jsonnet package.jsonnet > package.json
              '';

              installPhase = ''
                mkdir -p $out
                cp -r . $out
              '';
            };

          in
          pkgs.buildNpmPackage {
            name = "grustonnet-plugin";
            src = generatedSrc;

            nativeBuildInputs = with pkgs; [
              nodejs
              vsce
            ];
            npmDepsHash = "sha256-twz4ojcxUTyrAiZzO4DWnxlPnadcA9cA7Z+kuhtOpeo=";

            buildPhase = ''
              npm run compile
              vsce package -o grustonnet.vsix
            '';

            installPhase = ''
              mkdir -p $out
              cp grustonnet.vsix $out/
            '';

          };
      };
    };
}
