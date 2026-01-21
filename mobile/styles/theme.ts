export const colors = {
    black: '#000000',
    slateIndigo: '#5568c4',
    amethyst: '#aa4ab9',
    periwinkle: '#b8cdf8',
    white: '#ffffff',
    error: '#ff4444',
    success: '#00c851'
};

export const theme = {
    colors,
    gradientOrder: [colors.slateIndigo, colors.amethyst, colors.periwinkle] as const,
};
