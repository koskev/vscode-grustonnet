local schema = import 'grustonnet_schema.json';
local package = import 'package_base.json';
package {
  contributes+: {
    configuration:
      [
        {
          title: field.key,
        } + field.value {
          properties: {
            // Special code to set the defaults as they need to be a separate "default" object for vscode :/
            // The rest is default schema stuff
            local propertyKey = std.get(std.get(field.value, 'default', null), key.key, null),
            ['grustonnet.languageServer.config.' + field.key + '.' + key.key]: key.value {
              [if propertyKey != null then 'default']: propertyKey,
            }
            for key in std.objectKeysValues(std.get(field.value, 'properties', default=field.value))
          },
        }
        for field in std.objectKeysValues(schema.properties)
      ] + [package.contributes.configuration],
  },
}
