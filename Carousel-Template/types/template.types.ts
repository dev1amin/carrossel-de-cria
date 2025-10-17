export interface TemplateConfig {
  id: string;
  name: string;
  thumbnail: string;
  description: string;
}

export const AVAILABLE_TEMPLATES: TemplateConfig[] = [
  {
    id: '1',
    name: 'Template 1',
    thumbnail: 'https://images.pexels.com/photos/7319337/pexels-photo-7319337.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Modern and clean design'
  },
  {
    id: '2',
    name: 'Template 2',
    thumbnail: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Bold and vibrant layout'
  },
  {
    id: '3',
    name: 'Template 3',
    thumbnail: 'https://images.pexels.com/photos/6372413/pexels-photo-6372413.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Elegant and professional'
  },
  {
    id: '4',
    name: 'Template 4',
    thumbnail: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Minimalist style'
  },
  {
    id: '5',
    name: 'Template 5',
    thumbnail: 'https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Dynamic and energetic'
  },
  {
    id: '6',
    name: 'Template 6',
    thumbnail: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=400',
    description: 'Creative and artistic'
  }
];
