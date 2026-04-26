{
  languages(name, extensions)::
    {
      languages: [
        {
          id: name,
          aliases: [
            std.asciiUpper(name[0]) + name[1:],
            name,
          ],
          extensions: std.map(function(extension) if extension[0] == '.' then extension else '.%s' % extension, extensions),
          configuration: './language/configuration.jsonc',
        },
      ],
      grammars: [
        {
          language: name,
          scopeName: 'source.%s' % name,
          path: './language/%s.tmLanguage.json' % name,
        },
      ],
      breakpoints: [
        {
          language: name,
        },
      ],
    },
}
