local schema = import '../grustonnet_schema.json';
{
  baseSettings(name, repo):: {
    type: 'object',
    title: '%s Plugin Settings' % name,
    properties: {
      ['%s.languageServer.releaseRepository' % name]: {
        type: 'string',
        default: repo,
        description: 'Github repository to download the language server from',
      },
      ['%s.languageServer.enableAutoUpdate' % name]: {
        scope: 'resource',
        type: 'boolean',
        default: true,
      },
      ['%s.languageServer.pathToBinary' % name]: {
        scope: 'resource',
        type: 'string',
        description: 'Path to language server binary',
      },
      ['%s.debugger.pathToBinary' % name]: {
        scope: 'resource',
        type: 'string',
        description: 'Path to debugger',
      },
    },
  },
  languageServerSettings():: [
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
  ],
}
