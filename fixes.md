# Correções gerais

    1. Layout
        a. Inserir o título do vídeo acima do player
        b. Inserir abaixo do player: data de criação: data da última atualização e duração do vídeo
        c. Na área de iteratividade do usuário, há momentos em que o conteúdo depende do processamento do LLM. Nesse caso atualmente a mensagem é "O processamento iniciará automaticamente." Altere para um spinner gráfico bem visível que ocupe boa parte da área.
        d. O botão de Avançar de Fase diz "Avançar para a Fase X" mas seria menor dizer o nome da pŕoxima fase. Ex: Avançar para Análise de Edição.
        e. Quando uma chamada de LLM falhar por PARSE_ERROR, automaticamente faça uma nova chamada como re-tentativa.
        f. Na área de "console", os alertas devem ser colapsáveis. Sempre que um novo item for adicionado ou atualizado, os demais item se fecham deixando só o atual em evidência.

    2. Performance e Arquitetura
        a. Ao iniciar uma fase que é do tipo imutável, a chamada LLM só deve ser disparada se o respectivo campo de persistência já não estiver sido preenchido. Caso estejam, não deve-ser processar novamente, mas sim resgatar o dado do Firestore e carregar na área de console.
        b. Ao abrir um vídeo, deve-se validar o critério de avanço de todas as fases:
            i. Se todos os critérios já estiverem compridos com os dados do Firestore, essa fase é marcada como completa e habilitada para avanço.
            ii. Caso ainda restem fases não validadas, o produtor deve ser direcionado para a primeira fase ainda não completada.
            iii. Excessão feita para as fases de Edição e Compliance, que devem ser marcadas como completas somente quando o produtos confirmar a revisão através do Alert Box. A fase fica marcada como imcompleta, mas se já houver dados no campo de persistência, não é necessário chamar o LLM novamente.
        c. Anexo da chamada LLM: na API do Gemini, ao anexar um arquivo, ele te devolve um ID. Mantenha o ID de cada arquivo enviado (SRT e TXT) e reaproveite para as próximas chamadas LLM referente ao mesmo vídeo, isso economiza tokens e tráfego de rede. Esse ID deve ser descartado e o upload refeito caso o produtor alterne entre videos.

    3. Correções
        a. No resumo apresentado na Fase 8 (enviar para o Youtube) o campo de "Descrição" está vazio. Ele deve ser preenchido com o conteúdo do campo `description` persistido no objeto `video`. O mesmo vale para as tags e capítulos.