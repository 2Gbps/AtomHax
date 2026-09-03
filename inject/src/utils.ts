export const formatDate = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
           `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export const createButton = (
		label: string,
		backgroundColor: string,
		overColor: string,
		onClick: () => void
	): HTMLButtonElement => {
		const btn = document.createElement('button');
		btn.textContent = label;
		btn.style.flex = '1';
		btn.style.padding = '8px 0';
		btn.style.fontSize = '14px';
		btn.style.fontWeight = 'bold';
		btn.style.border = '1px solid rgba(255,255,255,0.1)';
		btn.style.borderRadius = '8px';
		btn.style.cursor = 'pointer';
		btn.style.transition = 'background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease';
		btn.style.background = `linear-gradient(135deg, ${backgroundColor}cc 0%, ${backgroundColor}99 100%)`;
		btn.style.backdropFilter = 'blur(8px)';
		btn.style.webkitBackdropFilter = 'blur(8px)';
		btn.style.color = 'white';
		btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)';

		btn.addEventListener('click', onClick);
		btn.addEventListener('mouseenter', () => {
			btn.style.background = `linear-gradient(135deg, ${overColor}dd 0%, ${overColor}aa 100%)`;
			btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)';
			btn.style.transform = 'translateY(-1px)';
		});
		btn.addEventListener('mouseleave', () => {
			btn.style.background = `linear-gradient(135deg, ${backgroundColor}cc 0%, ${backgroundColor}99 100%)`;
			btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)';
			btn.style.transform = 'translateY(0)';
		});

		return btn;
};
