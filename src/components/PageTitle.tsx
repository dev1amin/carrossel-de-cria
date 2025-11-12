import React from 'react';

interface PageTitleProps {
  title: string;
}

const PageTitle: React.FC<PageTitleProps> = ({ title }) => {
  return (
    <div className="bg-black border-b border-white/10">
      <div className="container mx-auto px-4 py-4">
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          {title}
        </h1>
      </div>
    </div>
  );
};

export default PageTitle;