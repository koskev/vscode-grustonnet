local package = import 'package_base.json';

local language = import 'package/language.libsonnet';
local settings = import 'package/settings.libsonnet';


package {
  contributes+: {
    configuration:
      settings.languageServerSettings() +
      [
        settings.baseSettings('grustonnet', 'koskev/grustonnet-ls'),
      ],
  } + language.languages('jsonnet', ['jsonnet', 'libsonnet']),
}
