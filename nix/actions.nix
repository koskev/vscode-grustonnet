{ inputs, ... }:

let
  inherit (inputs.nix-actions.lib) actions;
  inherit (inputs.nix-actions.lib) steps;
  inherit (inputs.nix-actions.lib) mkBuild;
  inherit (inputs.nix-actions.lib) platforms;
in
{
  imports = [ inputs.actions-nix.flakeModules.default ];
  flake.actions-nix = {
    pre-commit.enable = true;
    defaultValues = {
      jobs = {
        runs-on = "ubuntu-latest";
      };
    };
    workflows = {
      ".github/workflows/build.yaml" = mkBuild {
        targetPlatforms = [ platforms.linux ];
      };

      ".github/workflows/release.yaml" = {
        on = {
          push.tags = [ "v*" ];
          workflow_dispatch = { };
        };
        jobs = {
          changelog.steps = [
            steps.checkout-full
            {
              name = "Generate a changelog";
              uses = actions.git-cliff;
              "with" = {
                config = "cliff.toml";
                args = "--verbose --current";
              };
              env = {
                OUTPUT = "CHANGELOG.md";
              };
            }
            {
              name = "Upload changelog";
              uses = actions.upload-artifact;
              "with" = {
                name = "changelog";
                path = "CHANGELOG.md";
                retention-days = 1;
              };
            }
          ];
          release = {
            needs = [ "changelog" ];
            steps = [
              steps.checkout
              steps.installNix
              steps.exportVersion
              steps.downloadChangelog
              {
                name = "Build";
                run = ''
                  echo $(jq ".version = \"$TAG_VERSION\"" package_base.json) > package_base.json
                  nix build . --accept-flake-config
                '';
              }
              {
                name = "Publish artifacts and release";
                uses = actions.gh-release;
                "with" = {
                  files = "result/grustonnet.vsix";
                  body_path = "changelog/CHANGELOG.md";
                };
              }
            ];
          };
        };
      };
    };
  };
}
