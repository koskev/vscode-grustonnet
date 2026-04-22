{ inputs, ... }:

let
  inherit (inputs.nix-actions.lib) actions;
  inherit (inputs.nix-actions.lib) steps;
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
              {
                name = "Generate Version";
                run = ''
                  GITHUB_TAG_NAME=''${{ github.ref_name }}
                  TAG_NAME=''${GITHUB_TAG_NAME:-v0.0.0}
                  TAG_VERSION=''${TAG_NAME: 1}
                  echo "TAG_VERSION=$TAG_VERSION" >> $GITHUB_ENV
                '';
              }
              {
                name = "Get changelog";
                uses = actions.download-artifact;
                "with" = {
                  name = "changelog";
                  path = "changelog";
                };
              }
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
