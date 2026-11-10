import { t, uiLocale } from './i18n';
import { Check, Image, Palette, RotateCcw, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { appearanceStyle, useChatAppearance, type ChatAppearance } from './appearance';

const colors: { key: keyof Pick<ChatAppearance, 'textColor' | 'italicColor' | 'boldColor' | 'quoteColor' | 'linkColor'>; title: string; syntax: string }[] = [
  { key: 'textColor', title: 'Основной текст', syntax: 'Обычная речь' },
  { key: 'italicColor', title: 'Курсив и действия', syntax: '*текст в звёздочках*' },
  { key: 'boldColor', title: 'Жирный текст', syntax: '**важные слова**' },
  { key: 'quoteColor', title: 'Цитаты', syntax: '> цитата' },
  { key: 'linkColor', title: 'Ссылки', syntax: '[название](адрес)' }
];
const preview = '*На столе лежит открытая книга.*\n\n— У каждой истории есть **своё начало**. Каким будет наше?\n\n> Некоторые слова хочется сохранить.\n\n[Письмо из архива](#)';

function ColorSetting({title,syntax,value,onChange}:{title:string;syntax:string;value:string;onChange:(value:string)=>void}) {
  const [hex,setHex]=useState(value);
  useEffect(()=>setHex(value),[value]);
  return <div className="appearance-color"><span><strong>{t(title)}</strong><small>{t(syntax)}</small></span><span className="color-value"><input className="color-hex" aria-label={`HEX: ${t(title)}`} type="text" spellCheck={false} autoComplete="off" maxLength={7} value={hex} onChange={e=>{setHex(e.target.value);if(/^#[\da-f]{6}$/i.test(e.target.value))onChange(e.target.value);}} onBlur={()=>setHex(value)}/><input aria-label={t("Цвет: {0}",{0:t(title)})} type="color" value={value} onChange={e=>onChange(e.target.value)}/></span></div>;
}

export default function ChatAppearanceSettings({avatar}:{avatar?:string}) {
  const { appearance, update, reset, storageFailed } = useChatAppearance();
  return <div className="appearance-settings">
    <p className="appearance-description">{t("Шрифт, цвета и фон сохраняются в этом браузере.")}</p>
    <div className="appearance-subheading"><Type size={16}/><h3>{t("Чтение")}</h3></div>
    <div className="appearance-reading">
      <label className="appearance-range"><span>{t("Размер текста ")}<output>{appearance.fontSize} px</output></span><input aria-label={t("Размер текста чата")} type="range" min="12" max="26" step="1" value={appearance.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })}/><span className="range-hints"><small>{t("Компактнее")}</small><small>{t("Крупнее")}</small></span></label>
      <label className="appearance-range"><span>{t("Межстрочный интервал ")}<output>{appearance.lineHeight.toFixed(2)}</output></span><input aria-label={t("Межстрочный интервал чата")} type="range" min="1.3" max="2.3" step="0.05" value={appearance.lineHeight} onChange={e => update({ lineHeight: Number(e.target.value) })}/></label>
      <div className="appearance-font"><span>{t("Шрифт сообщений")}</span><div className="segmented-control" role="group" aria-label={t("Шрифт сообщений")}><button type="button" aria-pressed={appearance.fontFamily === 'sans'} onClick={() => update({ fontFamily: 'sans' })}><Type size={15}/>{t("Обычный")}</button><button type="button" className="serif-option" aria-pressed={appearance.fontFamily === 'serif'} onClick={() => update({ fontFamily: 'serif' })}>Aa <span>{t("Книжный")}</span></button></div></div>
    </div>
    <div className="appearance-preview" style={appearanceStyle(appearance)}>{appearance.wallpaper&&avatar&&<div className="chat-wallpaper" aria-hidden="true"><img src={avatar} alt=""/></div>}<div className="appearance-preview-heading"><span className="mini-dot"/>{t("ПРЕДПРОСМОТР")}</div><div className="message-text"><ReactMarkdown components={{ a: ({ children }) => <span className="preview-link">{children}</span> }}>{t(preview)}</ReactMarkdown></div></div>
    <div className="appearance-subheading"><Image size={16}/><h3>{t("Фон из аватарки персонажа")}</h3></div>
    <label className="wallpaper-switch"><span>{t("Аватарка на фоне чата")}</span><input type="checkbox" checked={appearance.wallpaper} onChange={e=>update({wallpaper:e.target.checked})}/></label>
    <p className="wallpaper-help">{t("Фон автоматически меняется вместе с персонажем. Без аватарки остаётся тёмный фон.")}</p>
    {appearance.wallpaper&&<div className="appearance-reading">
      <label className="appearance-range"><span>{t("Затемнение ")}<output>{appearance.wallpaperDim}%</output></span><input aria-label={t("Затемнение фона")} type="range" min="0" max="100" value={appearance.wallpaperDim} onChange={e=>update({wallpaperDim:Number(e.target.value)})}/></label>
      <label className="appearance-range"><span>{t("Размытие ")}<output>{appearance.wallpaperBlur} px</output></span><input aria-label={t("Размытие фона")} type="range" min="0" max="20" value={appearance.wallpaperBlur} onChange={e=>update({wallpaperBlur:Number(e.target.value)})}/></label>
      <div className="appearance-font"><span>{t("Подгонка изображения")}</span><div className="segmented-control"><button type="button" aria-pressed={appearance.wallpaperFit==='cover'} onClick={()=>update({wallpaperFit:'cover'})}>{t("Заполнить")}</button><button type="button" aria-pressed={appearance.wallpaperFit==='contain'} onClick={()=>update({wallpaperFit:'contain'})}>{t("Целиком")}</button></div></div>
      <label className="appearance-range"><span>{t("Положение по высоте ")}<output>{appearance.wallpaperPosition}%</output></span><input aria-label={t("Положение фона")} type="range" min="0" max="100" value={appearance.wallpaperPosition} onChange={e=>update({wallpaperPosition:Number(e.target.value)})}/><span className="range-hints"><small>{t("Верх")}</small><small>{t("Низ")}</small></span></label></div>}
    <div className="appearance-subheading"><Palette size={16}/><h3>{t("Цвета текста и Markdown")}</h3></div>
    <div className="appearance-colors">{colors.map(color => <ColorSetting key={color.key} title={color.title} syntax={color.syntax} value={appearance[color.key]} onChange={value=>update({[color.key]:value})}/>)}</div>
    <label className="wallpaper-switch"><span>{t("Плавные анимации")}</span><input type="checkbox" checked={appearance.animations} onChange={e=>update({animations:e.target.checked})}/></label>
    <p className="wallpaper-help">{t("Плавное открытие окон и появление новых сообщений. Учитывается системная настройка уменьшения движения.")}</p>
    <div className="appearance-bottom"><span className={storageFailed ? 'error-text' : ''}><Check size={13}/>{storageFailed ? t("Браузер не разрешил сохранение настроек.") : t("Сохраняется в этом браузере")}</span><button type="button" className="button small" onClick={reset}><RotateCcw size={14}/>{t("Сбросить оформление")}</button></div>
  </div>;
}
