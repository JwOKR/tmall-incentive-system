import { useRef, useCallback } from 'react';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * 自定义日期选择器组件
 * 解决原生 <input type="date"> 点击文字无法打开选择器的问题
 */
export default function DatePicker({ value, onChange, className = '', placeholder = '选择日期' }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 点击整个容器时触发日期选择器
  const handleClick = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  }, []);

  return (
    <div
      className={`relative inline-flex items-center cursor-pointer ${className}`}
      onClick={handleClick}
    >
      <Calendar className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-3 py-2 text-sm bg-transparent border-0 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        style={{ colorScheme: 'light' }}
      />
      {!value && (
        <span className="absolute left-10 text-sm text-muted-foreground pointer-events-none">
          {placeholder}
        </span>
      )}
    </div>
  );
}