import { t, uiLocale } from './i18n';
import { Copy, GitBranch, Layers, MoreHorizontal, Pencil, Play, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Message } from '../shared/types';
import { ToolPanel } from './ToolPanel';

type Props = {
  message: Message;
  latest: boolean;
  canRegenerate: boolean;
  locked: boolean;
  onCopy: ()=>void;
  onEdit: ()=>void;
  onRegenerate: ()=>void;
  onContinue: ()=>void;
  onFork: ()=>void;
  onPreview: ()=>void;
  onVariant: (id:string)=>void;
  open: boolean;
  onOpen: ()=>void;
};

export default function MessageActions({message,latest,canRegenerate,locked,onCopy,onEdit,onRegenerate,onContinue,onPreview,onVariant,open,onOpen}:Props) {
  const variants=message.variants||[],index=variants.findIndex(variant=>variant.id===message.selectedVariantId);
  const hasVariants=variants.length>1,canContinue=latest&&message.role==='assistant'&&!!message.content.trim();
  return <div className={`message-tools ${latest?'latest-tools':'history-tools'}`}>
    {latest&&<div className="message-primary-actions">
      {canContinue&&<button className="continue-action" aria-label={t("Продолжить ответ")} disabled={locked} onClick={onContinue}><Play size={14}/><span>{t("Продолжить")}</span></button>}
      {canRegenerate&&<button className="regenerate-action" aria-label={t("Перегенерировать ответ")} title={t("Другой ответ")} disabled={locked} onClick={onRegenerate}><RefreshCw size={16}/><span>{t("Другой ответ")}</span></button>}
    </div>}
    {latest&&hasVariants&&<div className="variant-switcher" role="group" aria-label={t("Варианты ответа")}>
      <button aria-label={t("Предыдущий вариант ответа")} disabled={locked||index<=0} onClick={()=>onVariant(variants[index-1].id)}><ChevronLeft size={17}/></button>
      <button className="variant-count" aria-label={t("Посмотреть варианты ответа")} title={t("Вариант {0} из {1}",{0:index+1,1:variants.length})} disabled={locked} onClick={onPreview}>{index+1} / {variants.length}</button>
      <button aria-label={t("Следующий вариант ответа")} disabled={locked||index<0||index>=variants.length-1} onClick={()=>onVariant(variants[index+1].id)}><ChevronRight size={17}/></button>
    </div>}
    <div className="message-utility-actions">
      <div className="message-hover-actions">
        <button aria-label={t("Скопировать сообщение")} title={t("Скопировать")} onClick={onCopy}><Copy size={15}/></button>
        <button aria-label={t("Редактировать сообщение")} title={t("Редактировать")} disabled={locked} onClick={onEdit}><Pencil size={15}/></button>
        {!latest&&canRegenerate&&<button aria-label={t("Перегенерировать ответ")} title={t("Другой ответ")} disabled={locked} onClick={onRegenerate}><RefreshCw size={15}/></button>}
      </div>
      <button className="message-more" aria-label={t("Действия с сообщением")} title={t("Действия с сообщением")} aria-controls="chat-tools" aria-expanded={open} onClick={onOpen}><MoreHorizontal size={19}/></button>
    </div>
  </div>;
}

export function MessageActionPanel({message,canRegenerate,locked,onCopy,onEdit,onRegenerate,onFork,onPreview,onClose}:Pick<Props,'message'|'canRegenerate'|'locked'|'onCopy'|'onEdit'|'onRegenerate'|'onFork'|'onPreview'>&{onClose:()=>void}) {
  const variants=message.variants||[],index=variants.findIndex(variant=>variant.id===message.selectedVariantId);
  function act(action:()=>void){onClose();action();}
  return <ToolPanel title={t("Действия с сообщением")} onClose={onClose} compact><div className="modal-scroll message-action-list">
      <button aria-label={t("Скопировать сообщение")} onClick={()=>act(onCopy)}><Copy size={17}/><span>{t("Скопировать")}</span></button>
      <button aria-label={t("Редактировать сообщение")} disabled={locked} onClick={()=>act(onEdit)}><Pencil size={17}/><span>{t("Редактировать")}</span></button>
      {canRegenerate&&<button aria-label={t("Перегенерировать ответ")} disabled={locked} onClick={()=>act(onRegenerate)}><RefreshCw size={17}/><span>{t("Другой ответ")}</span></button>}
      {variants.length>1&&<button aria-label={t("Посмотреть варианты ответа")} disabled={locked} onClick={()=>act(onPreview)}><Layers size={17}/><span>{t("Варианты ответа")}<small>{t("Выбран ")}{index+1} {t(" из ")}{variants.length}</small></span></button>}
      <button aria-label={t("Продолжить отсюда в новой ветке")} disabled={locked} onClick={()=>act(onFork)}><GitBranch size={17}/><span>{t("Новая ветка отсюда")}</span></button>
      {message.model&&<small className="message-model-note">{t("Модель ответа · ")}{message.model}</small>}
    </div></ToolPanel>;
}
