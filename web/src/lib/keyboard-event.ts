type ComposingEvent = {
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
    nativeEvent?: { isComposing?: boolean; keyCode?: number; which?: number };
};

/** 中文输入法选词时，Enter/方向键不应触发生成、提交或画布快捷键。 */
export function isComposingKeyboardEvent(event: ComposingEvent) {
    return Boolean(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.which === 229 || event.nativeEvent?.keyCode === 229 || event.nativeEvent?.which === 229);
}
