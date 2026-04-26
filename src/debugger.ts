import {
  commands,
  debug,
  window,
  ExtensionContext,
  Uri,
  OutputChannel,
  ProviderResult,
  WorkspaceFolder,
  DebugConfiguration,
  DebugConfigurationProviderTriggerKind,
  DebugAdapterExecutable,
  DebugAdapterDescriptor,
  DebugSession,
  DebugAdapterDescriptorFactory,
} from 'vscode';

import {
  ExecuteCommandParams,
  ExecuteCommandRequest,
  LanguageClient,
} from 'vscode-languageclient/node';

import { getBinPathExists } from './install';

export class JsonnetDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {
  context: ExtensionContext;
  binPath: string;

  constructor(context: ExtensionContext, binPath: string) {
    this.context = context;
    this.binPath = binPath;
  }

  createDebugAdapterDescriptor(
    _session: DebugSession,
    _executable: DebugAdapterExecutable | undefined
  ): ProviderResult<DebugAdapterDescriptor> {
    return new DebugAdapterExecutable(this.binPath);
  }
}


export async function installDebugger(context: ExtensionContext, channel: OutputChannel): Promise<void> {
  const binPath = await getBinPathExists(context, channel, 'debugger');
  if (!binPath) {
    return;
  }
  debug.registerDebugAdapterDescriptorFactory('jsonnet', new JsonnetDebugAdapterDescriptorFactory(context, binPath));
}

export function registerDebugger(
  context: ExtensionContext,
  channel: OutputChannel,
  client: LanguageClient,
) {
  context.subscriptions.push(
    debug.registerDebugConfigurationProvider(
      'jsonnet',
      {
        provideDebugConfigurations(_folder: WorkspaceFolder | undefined): ProviderResult<DebugConfiguration[]> {
          return [
            {
              name: 'Debug current Jsonnet file',
              request: 'launch',
              type: 'jsonnet',
              program: '${file}',
            },
          ];
        },
        async resolveDebugConfiguration(_folder, debugConfiguration, _token) {
          const params: ExecuteCommandParams = {
            command: "config.jpaths",
          };
          debugConfiguration.jpaths = await client.sendRequest(ExecuteCommandRequest.type, params);
          params.command = "config.extvars";
          debugConfiguration.extvars = await client.sendRequest(ExecuteCommandRequest.type, params);
          params.command = "config.extcode";
          debugConfiguration.extcode = await client.sendRequest(ExecuteCommandRequest.type, params);

          channel.appendLine(`Starting debugger with ${JSON.stringify(debugConfiguration)}`)

          return debugConfiguration

        },
      },
      DebugConfigurationProviderTriggerKind.Dynamic
    ),
    commands.registerCommand('grustonnet.debugEditorContents', (resource: Uri) => {
      let targetResource = resource;
      if (!targetResource && window.activeTextEditor) {
        targetResource = window.activeTextEditor.document.uri;
      }
      if (targetResource) {
        debug.startDebugging(undefined, {
          type: 'jsonnet',
          name: 'Debug File',
          request: 'launch',
          program: targetResource.fsPath,
        });
      }
    })
  );
}
