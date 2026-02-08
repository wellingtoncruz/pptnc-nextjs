# Correções

1. A única forma de avançar entre as fases atualmente é através do breadcrumb. Ao cumprir os critérios de avanço de cada Fase, o produtor deveria ter um botão ou algo semelhante que permita ele explicitamente avançar de fase.

# Mudanças

Unifiquei nesse documento a mecânica lógica de cada fase e detalhei os padrões de prompts que devem ser usados em cada uma.

## Mecânica eFluxo geral de edição de metadados

1. O produtor clica em um vídeo do seu lado esquerdo para trabalhar. Ele escolher um vídeo que não está bloqueado (ou seja, já passou pelas validações de requisitos de visibilidade, disponibilidade da transcrição, etc).
    - Ao clicar o painel de trabalho no vídeo se abre do seu lado direito. Esse painel contém:
        - Pré-visualização do vídeo com player do Youtube
        - Um painel para edição dos metadados no formato de Wizard, dividido em fases. Pode-se ter um breadcrumb para o usuário ter feedback visual das fases.
        - O espaço da UI deve ser mais ou menos com a seguir:
            - Primeira metade da área:
                - Lado esquerdo, previsualização do video com player embedded.
                - Lado direito, painel interativo para escolhas e interatividade com o produtor.
            - Segunda metade da área:
                - Um espaço abaixo do painel, que vamos chamar de "área de console", onde vamos empilhar de cima para baixo mensagens sobre os metadados.
                    - Nessa área, enquanto a chamada na API do LLM é processada, será exibido um Spinner.
                    - Depois do retorno do LLM o Spinner é sibstituido por um componentende Alert,  que pode variar em cores de acordo com a mensagem que procura transmitir.
                    - Para cada fase, vou definir a seguir as mensagens do Spinner e do Alert.
            - Cada fase do Wizard realizará chamadas a API do LLM. O avanço para a fase seguinte só será desbloqueado após a finalização dessas chamadas e o conteúdo exibido.
            - As fases se dividem em dois tipos:
                - Tipo 1: Reprocessáveis: 
                    - As fases do Tipo 1 podem ser reprocessadas.
                    - Devem ter um campo de input para o produtor escrever livremente um complemento de prompt (seja mais formal, direto, etc) e um botão de Reprocessar.
                    - Esse botão reprocessa a chamada LLM e remonta as áreas do UI com o novo retorno.
                - Tipo 2: Imutáveis:
                    - Não possuem input e opção de reprocessar.
                - Esse reprocessamento deve ser sempre confirmado atráves de um componente Alert Dialog.
            - Toda iteratividade do usuário deve ser salva com Autosave.
            - Cada Fase tem um critério de avanço (condições para permitir ir para a próxima fase) que será detalhado a seguir individualmente.
            - Os templates dos prompts LLM para cada Fase serão detalhados a seguir.
        - Por questões de SEO, cada fase de geração de metadados, depende das escolhas e dos metadados gerados nas fases anteriores. Por tanto, o produtor vai passar pelas fases em sequência, podendo voltar para algumas fases anteriores, mas obrigatoriamente precisa reprocessar todas as fases seguintes.

## Padrões gerais para todas as chamadas de LLM

1. Características comuns a todas as chamadas de LLM para edição do vídeo:
    - Todas as fases da edição têm uma regra específica para montagem do prompt (payload da API). As regras serão descritas na sequência.
    - Cada chamada tem uma `persona` atrelada. Os dados da persona está diretamente persistido ao podcast no objeto "personas". Para montar o prompt, você deve carregar o objeto de persona adequado.
    - Cada chamada tem prompts pré-definidos. Os prompts estão atrelados diretamente ao podcast no objeto "prompts". Para montar o prompt, você deve carregar esse objeto de prompts de acordo com o tipo de video de acordo com videoType.
    - Cada chamada tem um anexo. Eles podem ser o conteudo do campo transcriptionSRT ou transcriptionTXT, a ser definido para cada Fase. Independente do campo, você deve sempre salvar o conteudo do campo em um arquivo temporário e passar para a API da Gemini como ANEXO do prompt. 
    - Os prompts padrão serão definidos com {placeholes} você deve interpretar esses placeholes com os dados adequados.

## Descrição Específicas das fases

1. Sobre a sequência e fases da edição, seus critérios de avanço e prompts templates específicos

    1.1 Fase 1 - Input Inicial e Crítica | Tipo 2 - Imutável

        A) Mecânica
            - O que será processado no LLM: Crítica do vídeo.
            - A primeira fase do Wizard é a fase que já vem aberta no Wizard e é a primeira que o produtor ve ao clicar no vídeo e iniciar o trabalho.
            - Área de iteratividade: Vai trazer o seu inputs iniciais para preenchimento pelo produtor (tema geral do episódio, co-host e convidados).
            - Área de console:
                - Spinner: "Estou assistindo o episódio para te dar uma opnião sincera..."
                - Alert:
                    - Título: "Critíca do Especialista"
                    - Texto: retorno do LLM.
            - Persistência: retorno do LLM deve ser persistido no campo `critique`, na raiz do objeto `video`.
            - Critérios de Avanço:
                - Retorno do LLM com sucesso
                - Campo `critique` persistido
                - Inputs preenchidos: tema do episódio, co-host e convidados.

        B) LLM
            - Persona: critic
            - Anexo: transcriptionTXT
            - Prompt: 
                ``` 
                    Seu papel: {persona.role}
                    Seu objetivo: {persona.objective}
                    Seu contexto: {persona.resume}
                    Sua tarefa: {prompts.{videoType}.critique.description}
                    Seu retorno deve ser estritamente: {prompts.{videoType}.critique.expectedOutput}
                ```
        
    1.2 Fase 2 - Checagem de Edição | Tipo 2 - Imutável

        A) Mecânica 

        - O que será processado no LLM: possíveis falhas na edição.
        - Nessa fase, a chamada de LLM vai através da transcrição SRT verificar se tem alguma possível falha na edição do vídeo.
        - Área de iteratividade:
            - Inicia com componente Loading
            - Após a chamada do LLM, o conteúdo da iteratividade vai depender de:
                - Houve possíveis falhas de edição: apresenta uma lista com timestamps de onde está a possível falha de edição e uma descrição da falha.
                    - Ao clicar nesse timestampo, o produtor vai direto para o ponto exato do vídeo para verificação. (mesma mecânima do portal web)
                - Se não houve falhas na edição: apesenta um Card: Parabéns, não há falhas de edição que eu possa identificar.
        - Área de console:
            - Spinner: "Verificando se existem falhas de edição perceptíveis ..."
            - Alert:
                - Título: "Checagem de Edição"
                - Texto: "Verifique acima de existem trechos que você deveria verificar. Obs: Nada substitui a revisão humana, ok?"
        - Persistência: retorno do LLM deve ser persistido no campo `editingIssues`, na raiz do objeto `video`.
        - Critérios de Avanço:
            - Retorno do LLM com sucesso
            - Campo `editingIssues` persistido
            - Caso haja falha na edição, o produtor deve responder a um Alert Box "Tem certeza que deseja continuar?"
            - Caso o produtor responda "Sim", avançe para a próxima fase.

        B) LLM

        - Persona: critic
        - Anexo: transcriptionSRT
        - Prompt: 
            ``` 
                Seu papel: {persona.role}
                Seu objetivo: {persona.objective}
                Seu contexto: {persona.resume}
                Sua tarefa: {prompts.{videoType}.editing.description}
                Seu retorno deve ser estritamente: {prompts.{videoType}.editing.expectedOutput}        
            ```
    1.3 Fase 3 - Análise de Risco e Conformidade | Tipo 2 - Imutável

        A) Mecânica 

            - O que será processado no LLM: possíveis pontos polêmicos e riscos de compliance.
            - Nesta fase, vamos verificar se existem possíveis pontos de compliance ou prejudiciais ao podcast.
            - Área de iteratividade:
                - Inicia com componente Loading
                - Após a chamada do LLM, o conteúdo da iteratividade vai depender de:
                    - Houve possíveis riscos de compliance: apresenta uma lista com timestamps de onde está o possível risco e sua descrição.
                        - Ao clicar nesse timestampo, o produtor vai direto para o ponto exato do vídeo para verificação. (mesma mecânima do portal web)
                    - Se não houve riscos: apesenta um Card: Não me parece haver riscos de compliance.
            - Área de console:
                - Spinner: "Verificando se existem pontos polêmicos ou riscos de conformidade ..."
                - Alert:
                    - Título: "Riscos e Conformidade"
                    - Texto: "Verifique acima de existem trechos que você deveria verificar."
            - Persistência: retorno do LLM deve ser persistido no campo `riskAndCompliance`, na raiz do objeto `video`.
            - Critérios de Avanço:
                - Retorno do LLM com sucesso
                - Campo `riskAndCompliance` persistido
                - Caso haja riscos, o produtor deve responder a um Alert Box "Tem certeza que deseja continuar?"
                - Caso o produtor responda "Sim", avançe para a próxima fase.

        B) LLM

        - Persona: critic
        - Anexo: transcriptionSRT
        - Prompt: 
            ``` 
                Seu papel: {persona.role}
                Seu objetivo: {persona.objective}
                Seu contexto: {persona.resume}
                Sua tarefa: {prompts.{videoType}.compliance.description}
                Seu retorno deve ser estritamente: {prompts.{videoType}.compliance.expectedOutput}        
            ```
    1.4 Fase 4 - Capítulos | Tipo 2 - Imutável

        A) Mecânica 

            - O que será processado no LLM: divisão de assuntos do podcast.
            - Nesta fase, vamos sugerir uma organização de capítulos baseado nos assuntos tratados no podcast.
            - Área de iteratividade:
                - Inicia com componente Loading
                - Após a chamada do LLM apresenta uma lista com timestamps com os títulos dos capítulos.
                    - Ao clicar nesse timestampo, o produtor vai direto para o ponto exato do vídeo para verificação. (mesma mecânima do portal web)
            - Área de console:
                - Spinner: "Fazendo a separação de capítulos..."
                - Alert:
                    - Título: "Capítulos:"
                    - Texto: A lista de capítulos com timestamp e títulos.
            - Persistência: retorno do LLM deve ser persistido no campo `chapters`, na raiz do objeto `video`.
            - Critérios de Avanço:
                - Retorno do LLM com sucesso
                - Campo `chapters` persistido
                - O produtor deve responder a um Alert Box "Aprova os capítulos?"
                - Caso o produtor responda "Sim", avance para a próxima fase.                    

        B) LLM

        - Persona: critic
        - Anexo: transcriptionSRT
        - Prompt: 
            ``` 
                Seu papel: {persona.role}
                Seu objetivo: {persona.objective}
                Seu contexto: {persona.resume}
                Sua tarefa: {prompts.{videoType}.chapters.description}
                Seu retorno deve ser estritamente: {prompts.{videoType}.chapters.expectedOutput}                     
            ``` 

    1.5 Fase 5: Título | Tipo 1 - Reprocessável

        A) Mecânica 

            - O que será processado no LLM: Sugestão de títulos para o podcast.
            - Nesta fase, vamos sugerir 5 títulos para o podcast.
            - Área de iteratividade:
                - Inicia com componente Loading
                - Após a chamada do LLM, a área de iteratividade apresenta:
                    - A lista de 5 títulos para que o produtor escolha o título definitivo para o vídeo.
                    - Input de texto para onde o produtor pode complementar o prompt {additionalContext}
            - Área de console:
                - Spinner: "Pensando em boas sugestões de título..."
                - Alert:
                    - Título: "Títulos"
                    - Texto: "Escolha o melhor título para o vídeo, ou me de uma dica para eu possa ajudar melhor."
            - Persistência: retorno do LLM deve ser persistido/atualizado no campo `title`, na raiz do objeto `video`.
            - Critérios de Avanço:
                - Retorno do LLM com sucesso
                - Campo `title` persistido

        B) LLM

        - Persona: writer
        - Anexo: transcriptionTXT
        - Prompt: 
            ```         
                Seu papel: {persona.role}
                Seu objetivo: {persona.objective}
                Seu contexto: {persona.resume}
                Sua tarefa: {prompts.{videoType}.titles.description}
                Seu retorno deve ser estritamente: {prompts.{videoType}.titles.expectedOutput}
                Dê uma atenção especial a essa instrução: {additionalContext}
            ``` 


    1.6 Fase 6: Descrição | Tipo 1 - Reprocessável

        A) Mecânica

            - O que será processado no LLM: A descrição do episódio otimizada com SEO.
            - Nesta fase, vamos sugerir a descrição do episódio.
            - Área de iteratividade:
                - Inicia com componente Loading
                - Após a chamada do LLM, a área de iteratividade apresenta:
                    - A text area com barra de rolagem para verificação da descrição.
                        - O usuário pode alterar livremente a descrição se assim desejar.
                    - Input de texto para onde o produtor pode complementar o prompt {additionalContext}                        
            - Área de console:
                - Spinner: "Calculando uma descrição otimizada para você..."
                - Alert:
                    - Título: "Descrição"
                    - Texto: "Confira a descrição e faça os ajustes se necessário:"
            - Persistência: retorno do LLM deve ser persistido/atualizado no campo `description`, na raiz do objeto `video`.
            - Critérios de Avanço:
                - Retorno do LLM com sucesso
                - Campo `description` persistido

        B) LLM

        - Persona: writer
        - Anexo: transcriptionTXT
        - Prompt: 
            ```         
                Seu papel: {persona.role}
                Seu objetivo: {persona.objective}
                Seu contexto: {persona.resume}
                Sua tarefa: {prompts.{videoType}.description.description}
                Seu retorno deve ser estritamente: {prompts.{videoType}.description.expectedOutput}
                Título do episódio: {title}
                Convidados: {guests}
                Dê uma atenção especial a essa instrução: {additionalContext}
            ``` 

    1.7 Fase 7: Tags | Tipo 1 - Reprocessável

        A) Mecânica

            - O que será processado no LLM: As tags do episódio.
            - Nesta fase, vamos usar o título e descrição do episódio para calcular as tags mais relevantes do episódio.
            - Área de iteratividade:
                - Inicia com componente Loading
                - Após a chamada do LLM, a área de iteratividade apresenta:
                    - Nuvem de tags como labels para o usuário revisar.
                        - O usuário pode remover ou incluir tags livremente.
            - Área de console:
                - Spinner: "Calculando as tags ...."
                - Alert:
                    - Título: "Tags"
                    - Texto: "Essas são as tags que eu produzi:" + {tags}
            - Persistência: retorno do LLM deve ser persistido/atualizado no campo `tags`, na raiz do objeto `video`.
            - Critérios de Avanço:
                - Retorno do LLM com sucesso
                - Campo `tags` persistido                    

        B) LLM

        - Persona: writer
        - Anexo: transcriptionTXT
        - Prompt: 
            ```         
                Seu papel: {persona.role}
                Seu objetivo: {persona.objective}
                Seu contexto: {persona.resume}
                Sua tarefa: {prompts.{videoType}.tags.description}
                Seu retorno deve ser estritamente: {prompts.{videoType}.tags.expectedOutput}
                Título do episódio: {title}
                Descrição do episódio: {description}
            ``` 
                
    1.8 Fase 8 - Atualizar Youtube

        A) Mecânica
            - O produtor tem o botão "Enviar para o Youtube" para atualizar os metadados via API

        B) LLM
            - Não há

        C) O detalhamento da chamada para a API do Youtube será descrito posteriormente em outro documento.
                
