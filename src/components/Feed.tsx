import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useAnimation } from 'framer-motion';
import { Post, SortOption } from '../types';
import PostCard from './PostCard';
import { Scale } from 'lucide-react';

interface FeedProps {
  posts: Post[];
  searchTerm: string;
  activeSort: SortOption;
}

const Feed: React.FC<FeedProps> = ({ posts, searchTerm, activeSort }) => {
  const [filteredPosts, setFilteredPosts] = useState<Post[]>(posts);
  const [currentIndex, setCurrentIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const isMobile = window.innerWidth <= 768;
  const sortingInProgress = useRef(false);
  const dragY = useMotionValue(0);
  const controls = useAnimation();

  useEffect(() => {
    console.log(`[Sort] Applying sort: ${activeSort}`);
    let result = [...posts];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(post => 
        post.username.toLowerCase().includes(term) || 
        post.text.toLowerCase().includes(term)
      );
    }
    
    result.sort((a, b) => {
      switch (activeSort) {
        case 'latest':
          return b.taken_at - a.taken_at;
        case 'popular':
          return b.overallScore - a.overallScore;
        case 'likes':
          return b.like_count - a.like_count;
        case 'comments':
          return b.comment_count - a.comment_count;
        case 'shares':
          return b.reshare_count - a.reshare_count;
        default:
          return 0;
      }
    });
    
    console.log(`[Sort] New post order: ${result.map(p => p.code).join(', ')}`);
    setFilteredPosts(result);
    
    // Reset to top when sort changes
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCurrentIndex(0);
  }, [posts, searchTerm, activeSort]);

  useEffect(() => {
    if (isMobile && feedRef.current) {
      document.body.style.overflow = 'hidden';
      
      const handleScroll = () => {
        if (feedRef.current && !sortingInProgress.current) {
          const scrollTop = feedRef.current.scrollTop;
          const itemHeight = window.innerHeight - 112;
          const newIndex = Math.round(scrollTop / itemHeight);
          const boundedIndex = Math.max(0, Math.min(newIndex, filteredPosts.length - 1));
          
          if (boundedIndex !== currentIndex) {
            console.log(`[Display] Current slide: ${boundedIndex}`);
            setCurrentIndex(boundedIndex);
          }
        }
      };

      const feedElement = feedRef.current;
      feedElement.addEventListener('scroll', handleScroll);
      
      return () => {
        feedElement.removeEventListener('scroll', handleScroll);
        document.body.style.overflow = 'auto';
      };
    }
  }, [isMobile, currentIndex, filteredPosts.length]);

  const handleDragEnd = async (event: any, info: any) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;
    const itemHeight = window.innerHeight - 112;
    
    let direction = 0;
    if (Math.abs(velocity) > 500 || Math.abs(offset) > 50) {
      direction = velocity < 0 ? 1 : -1;
    }
    
    const targetIndex = Math.max(
      0,
      Math.min(currentIndex - direction, filteredPosts.length - 1)
    );
    
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: targetIndex * itemHeight,
        behavior: 'smooth'
      });
    }
    
    await controls.start({ y: 0 });
    setCurrentIndex(targetIndex);
  };

  return (
    <div className="min-h-screen bg-black">
      {filteredPosts.length > 0 ? (
        <div 
          ref={feedRef} 
          className={`container mx-auto ${isMobile ? 'px-0' : 'px-4'} py-2`}
        >
          {isMobile ? (
            <div className="snap-y snap-mandatory h-[calc(100vh-7rem)] overflow-y-auto">
              {filteredPosts.map((post, index) => (
                <motion.div 
                  key={post.code}
                  className="snap-start h-[calc(100vh-7rem)] w-full flex items-start justify-center"
                  style={{ y: dragY }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={0.2}
                  onDragEnd={handleDragEnd}
                  animate={controls}
                >
                  <PostCard 
                    post={post} 
                    index={index}
                    onHover={() => {}}
                    onLeave={() => {}}
                    onAIClick={() => {}}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 justify-items-center">
              <AnimatePresence>
                {filteredPosts.map((post, index) => (
                  <motion.div
                    key={post.code}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex justify-center"
                  >
                    <PostCard 
                      post={post} 
                      index={index}
                      onHover={() => {}}
                      onLeave={() => {}}
                      onAIClick={() => {}}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : (
        <div className="container mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[60vh] text-white">
          
          <h2 className="text-2xl font-semibold mb-2">No posts found :(</h2>
          <p className="text-gray-400 text-center max-w-md">
            {searchTerm 
              ? `No posts match your search for "${searchTerm}".` 
              : `No posts match the selected filters.`}
          </p>
        </div>
      )}
    </div>
  );
};

export default Feed;