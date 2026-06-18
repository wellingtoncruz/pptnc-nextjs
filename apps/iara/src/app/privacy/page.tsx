/**
 * Privacy Policy — Public Page (Server Component)
 *
 * Public route: /privacy. No auth required (excluded from the proxy matcher).
 * Generic, common-practice privacy policy for a web-based application.
 */

import type { Metadata } from 'next'

import { LegalPage, Section, Paragraph, List } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Política de Privacidade · IAra',
  description: 'Política de Privacidade da plataforma IAra.',
}

const LAST_UPDATED = '18 de junho de 2026'

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Política de Privacidade" lastUpdated={LAST_UPDATED}>
      <Section title="1. Introdução">
        <Paragraph>
          Esta Política de Privacidade descreve como a plataforma IArA
          (&quot;IAra&quot;, &quot;nós&quot;, &quot;nosso&quot;) coleta, usa, armazena e
          protege as informações dos usuários (&quot;você&quot;) ao utilizar nossos
          serviços. Ao acessar ou usar a plataforma, você concorda com as práticas
          descritas neste documento. Caso não concorde, por favor, não utilize o serviço.
        </Paragraph>
      </Section>

      <Section title="2. Informações que coletamos">
        <Paragraph>
          Coletamos as seguintes categorias de informações para fornecer e melhorar o
          serviço:
        </Paragraph>
        <List
          items={[
            <>
              <strong>Informações de conta:</strong> nome, endereço de e-mail e foto de
              perfil fornecidos pelo provedor de autenticação (por exemplo, Google) quando
              você faz login.
            </>,
            <>
              <strong>Dados de autorização de terceiros:</strong> tokens de acesso
              necessários para integrar serviços que você autoriza expressamente (por
              exemplo, o gerenciamento de metadados de vídeos do seu canal).
            </>,
            <>
              <strong>Conteúdo fornecido por você:</strong> dados, textos e arquivos que
              você insere ou gera ao utilizar as funcionalidades da plataforma.
            </>,
            <>
              <strong>Dados de uso:</strong> informações técnicas sobre como você interage
              com o serviço, como páginas acessadas, ações realizadas, data e hora.
            </>,
            <>
              <strong>Dados do dispositivo e log:</strong> endereço IP, tipo de navegador,
              sistema operacional e identificadores de log usados para segurança e
              diagnóstico.
            </>,
            <>
              <strong>Cookies e tecnologias similares:</strong> usados para manter sua
              sessão autenticada e para o funcionamento essencial da plataforma.
            </>,
          ]}
        />
      </Section>

      <Section title="3. Como usamos as informações">
        <Paragraph>Utilizamos as informações coletadas para:</Paragraph>
        <List
          items={[
            'Fornecer, operar e manter o serviço;',
            'Autenticar usuários e proteger as contas contra acesso não autorizado;',
            'Executar as funcionalidades que você solicita, incluindo integrações com serviços de terceiros que você autoriza;',
            'Melhorar, personalizar e desenvolver novos recursos;',
            'Monitorar a estabilidade, a segurança e o desempenho da plataforma;',
            'Cumprir obrigações legais e responder a solicitações de autoridades quando exigido por lei.',
          ]}
        />
      </Section>

      <Section title="4. Compartilhamento de informações">
        <Paragraph>
          Não vendemos suas informações pessoais. Podemos compartilhar dados apenas nas
          seguintes situações:
        </Paragraph>
        <List
          items={[
            <>
              <strong>Provedores de serviço:</strong> com fornecedores de infraestrutura,
              hospedagem e processamento que atuam em nosso nome e sob obrigações de
              confidencialidade.
            </>,
            <>
              <strong>Serviços de terceiros autorizados por você:</strong> quando você
              conecta sua conta a um serviço externo, compartilhamos apenas o necessário
              para executar a integração solicitada.
            </>,
            <>
              <strong>Obrigações legais:</strong> quando exigido por lei, ordem judicial
              ou para proteger direitos, segurança e integridade do serviço e dos
              usuários.
            </>,
          ]}
        />
      </Section>

      <Section title="5. Serviços de terceiros">
        <Paragraph>
          A plataforma utiliza serviços de terceiros (por exemplo, provedores de
          autenticação, infraestrutura em nuvem e APIs de plataformas que você conecta).
          O uso desses serviços está sujeito às respectivas políticas de privacidade. Ao
          autorizar uma integração, você concorda com o tratamento de dados conforme
          descrito tanto nesta Política quanto na política do provedor correspondente.
        </Paragraph>
      </Section>

      <Section title="6. Retenção de dados">
        <Paragraph>
          Mantemos suas informações pelo tempo necessário para fornecer o serviço, cumprir
          obrigações legais, resolver disputas e fazer cumprir nossos acordos. Quando os
          dados não forem mais necessários, eles serão excluídos ou anonimizados de forma
          segura.
        </Paragraph>
      </Section>

      <Section title="7. Segurança">
        <Paragraph>
          Adotamos medidas técnicas e organizacionais razoáveis para proteger suas
          informações contra acesso não autorizado, alteração, divulgação ou destruição.
          No entanto, nenhum método de transmissão ou armazenamento é completamente
          seguro, e não podemos garantir segurança absoluta.
        </Paragraph>
      </Section>

      <Section title="8. Seus direitos">
        <Paragraph>
          Dependendo da legislação aplicável, você pode ter o direito de acessar,
          corrigir, atualizar ou excluir suas informações pessoais, bem como de revogar
          autorizações concedidas e se opor a determinados tratamentos. Para exercer esses
          direitos, entre em contato conosco pelos canais indicados abaixo.
        </Paragraph>
      </Section>

      <Section title="9. Revogação de acesso">
        <Paragraph>
          Você pode, a qualquer momento, revogar as permissões concedidas à plataforma
          diretamente nas configurações de segurança da sua conta no provedor de
          autenticação ou no serviço de terceiros conectado, encerrando o acesso da IAra
          aos dados correspondentes.
        </Paragraph>
      </Section>

      <Section title="10. Privacidade de menores">
        <Paragraph>
          O serviço não se destina a menores de idade conforme definido pela legislação
          aplicável. Não coletamos intencionalmente dados pessoais de menores. Caso
          tomemos conhecimento de tal coleta, tomaremos medidas para excluir essas
          informações.
        </Paragraph>
      </Section>

      <Section title="11. Transferências internacionais">
        <Paragraph>
          Suas informações podem ser processadas e armazenadas em servidores localizados
          em diferentes países. Ao utilizar o serviço, você concorda com a eventual
          transferência de dados para jurisdições que podem ter leis de proteção de dados
          distintas das do seu país de residência.
        </Paragraph>
      </Section>

      <Section title="12. Alterações nesta política">
        <Paragraph>
          Podemos atualizar esta Política de Privacidade periodicamente. Quando o fizermos,
          revisaremos a data de &quot;Última atualização&quot; no topo desta página.
          Recomendamos revisar este documento regularmente. O uso contínuo do serviço após
          alterações constitui aceitação da política revisada.
        </Paragraph>
      </Section>

      <Section title="13. Contato">
        <Paragraph>
          Em caso de dúvidas, solicitações ou preocupações relacionadas a esta Política de
          Privacidade ou ao tratamento dos seus dados, entre em contato pelo e-mail{' '}
          <a
            href="mailto:contato@pptnaocompila.com.br"
            className="text-primary underline underline-offset-2"
          >
            contato@pptnaocompila.com.br
          </a>
          .
        </Paragraph>
      </Section>
    </LegalPage>
  )
}
