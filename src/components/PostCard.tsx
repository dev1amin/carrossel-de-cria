import React, { useState } from 'react';
import { Heart, Play, Trophy, Medal, Award, ExternalLink, Sparkles } from 'lucide-react';
import { TemplateSelectionModal } from '../carousel';
import { Post } from '../types';
import { formatNumber } from '../utils/formatters';

interface PostCardProps {
  post: Post;
  index: number;
  onGenerateCarousel?: (code: string, templateId: string, postId?: number) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, index, onGenerateCarousel }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    if (!onGenerateCarousel) return;
    setIsModalOpen(true);
  };

  const handleSelectTemplate = (templateId: string) => {
    if (onGenerateCarousel) {
      onGenerateCarousel(post.code, templateId, post.id);
    }
  };
  const formatTimeAgo = (timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 3600) {
      const minutes = Math.floor(diff / 60);
      return `${minutes}m ago`;
    } else if (diff < 86400) {
      const hours = Math.floor(diff / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diff / 86400);
      return `${days}d ago`;
    }
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-4 h-4 text-white" />;
      case 1:
        return <Medal className="w-4 h-4 text-gray-400" />;
      case 2:
        return <Medal className="w-4 h-4 text-amber-600" />;
      default:
        return <Award className="w-4 h-4 text-white" />;
    }
  };

  const handleOpenOriginal = () => {
    const webFallbackUrl = `https://www.instagram.com/reel/${post.code}`;
    window.open(webFallbackUrl, '_blank');
  };

  return (
    <div className="relative w-full max-w-[300px] bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100">
        <div className="flex items-center space-x-4">
          <div className="flex items-center" style={{ color: 'rgb(255, 0, 0)' }}>
            <Heart className="w-4 h-4 mr-1 fill-current" />
            <span className="font-bold">{formatNumber(post.like_count)}</span>
          </div>
          {post.media_type === 2 && post.play_count && (
            <div className="flex items-center" style={{ color: 'rgb(0, 171, 63)' }}>
              <Play className="w-4 h-4 mr-1 fill-current" />
              <span className="font-bold">{formatNumber(post.play_count)}</span>
            </div>
          )}
        </div>
        <span className="text-sm text-gray-400 font-bold">{formatTimeAgo(post.taken_at)}</span>
      </div>
      <div className="relative w-full" style={{ paddingBottom: '140%' }}>
        <iframe
          src={`https://www.instagram.com/p/${post.code}/embed`}
          allow="autoplay; encrypted-media"
          scrolling="no"
          className="absolute top-0 left-0 w-full"
          style={{
            height: '800px',
            maxWidth: '300px',
            transform: 'scale(1)',
            transformOrigin: 'top left'
          }}
        />
        <button
          onClick={handleOpenOriginal}
          className="absolute top-3 right-1 z-50 bg-black text-white px-3 py-1.5 rounded text-sm flex items-center space-x-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>See Content</span>
        </button>
        <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end space-y-2">
          <div className="bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm flex items-center space-x-2">
            {getRankIcon(index)}
            <span>#{index + 1}</span>
          </div>
          {onGenerateCarousel && (
            <>
              <button
                onClick={handleOpenModal}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-3 py-1.5 rounded-full text-sm flex items-center space-x-2 transition-all shadow-lg hover:shadow-xl"
              >
                <Sparkles className="w-4 h-4" />
                <span>Gerar</span>
              </button>
              <TemplateSelectionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelectTemplate={handleSelectTemplate}
                postCode={post.code}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PostCard;