/**
 * `processkit init` wizard (Hubdocs pattern), fixed order:
 *
 *   1. Agents — checkbox, detected agents pre-checked.
 *   2. Lane — docs | fe | be.
 *   3. Tech — Processkit has none; the step is skipped.
 *
 * Prompts are injectable so tests can assert the order without a TTY.
 */

import { AGENT_IDS, AGENT_LABEL, detectAgents, type AgentId } from './agents.js'
import type { ProcesskitType } from './harness.js'
import { checkboxPrompt, selectPrompt } from './prompt.js'

export interface WizardPrompts {
  checkbox: typeof checkboxPrompt
  select: typeof selectPrompt
}

export interface WizardResult {
  agents: AgentId[]
  types: ProcesskitType[]
}

export async function runInitWizard(
  opts: { cwd?: string; prompts?: Partial<WizardPrompts> } = {},
): Promise<WizardResult> {
  const checkbox = opts.prompts?.checkbox ?? checkboxPrompt
  const select = opts.prompts?.select ?? selectPrompt
  const detected = detectAgents(opts.cwd)
  const pre = detected.length > 0 ? detected : (['cursor'] as AgentId[])

  console.log('processkit init — choose agents\n')
  const agents = await checkbox<AgentId>({
    message: 'Which agents should get the Processkit MCP?',
    choices: AGENT_IDS.map((id) => ({
      value: id,
      name: detected.includes(id) ? `${AGENT_LABEL[id]}  (detected)` : AGENT_LABEL[id],
      checked: pre.includes(id),
    })),
  })

  const types = await checkbox<ProcesskitType>({
    message: 'Which Processkit lanes? (Space toggle, a all, Enter confirm)',
    choices: [
      { value: 'docs', name: 'docs — process trace + impact review', checked: true },
      { value: 'fe', name: 'fe — impact review only' },
      { value: 'be', name: 'be — impact review only' },
    ],
  })

  return { agents, types: types.length ? types : ['docs'] }
}
