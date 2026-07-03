import { extractUserFacingPrompt, isAgentInjectedPrompt, isMostlyEnglishPrompt } from '@mirscope/shared';
import HoverExpandText from './HoverExpandText';
import './ConversationPreview.css';

interface ConversationPreviewProps {
  prompt: string | null | undefined;
  lines?: number;
}

export default function ConversationPreview({ prompt, lines = 2 }: ConversationPreviewProps) {
  const rawQuestion = prompt?.trim() ?? '';
  const question = extractUserFacingPrompt(rawQuestion) || rawQuestion;

  if (!question || isAgentInjectedPrompt(rawQuestion) || isAgentInjectedPrompt(question)) {
    return null;
  }
  if (isMostlyEnglishPrompt(rawQuestion) || isMostlyEnglishPrompt(question)) {
    return null;
  }

  return (
    <div className="conversation-preview">
      <HoverExpandText text={question} lines={lines} prefix="💬：" />
    </div>
  );
}
