import React from 'react';
import { Scale } from 'lucide-react';
import { motion } from 'framer-motion';
import FilterBar from './FilterBar';
import { SortOption } from '../types';

interface HeaderProps {
  onSearch: (term: string) => void;
  activeSort: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const Header: React.FC<HeaderProps> = ({ onSearch, activeSort, onSortChange }) => {
  return (
    <header className="fixed top-0 left-0 right-0 bg-black h-14 z-[100] shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <motion.div 
            className="flex items-center" 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
          <img
            src="https://cdn.prod.website-files.com/665825f3f5168cb68f2c36e1/6662ca6f1be62e26c76ef652_workezLogoWebp.webp"
            alt="Workez Logo"
            className="h-5"
          />
          </motion.div>
          
          <div className="w-32">
            <FilterBar
              activeSort={activeSort}
              onSortChange={onSortChange}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;