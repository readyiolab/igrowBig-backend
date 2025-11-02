// ✅ FIXED & OPTIMIZED: Default Page Data Generator
const db = require("../config/db");

// Default Homepage Data
const getDefaultHomePageData = () => ({
  hero_section_title: "Do you know what it means to have Dream Life?",
  hero_section_content: "<p>Living the Best Life means <strong>Excellent Health</strong>, Better Financial Potential, Enriching Personal Relationships and the freedom to spend YOUR time enjoying what makes you happy... we call that a <strong>Dream Life</strong>!</p>",
  hero_banner_image_url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=500&fit=crop",
  
  welcome_section_title: "Welcome to Get Dream Life",
  welcome_section_content: "<p>Get Dream Life (GDL) welcomes to the world of opportunity and infinite potential for a great life. Yes, we mean it, '<strong>Infinite Human Potential</strong>'. If you're worried about job security, interested in extra income opportunities or looking for a change in your professional career, your worries stop here. You are at the right place.</p><p>This is the time to start your own business, be your own boss, choose your time of working and <strong>Live Your Dream Life</strong>. Get what you deserve, more than you expect. GDL is promoting a great network marketing opportunity which is making entrepreneurs around the world over last 15 years.</p><p>Enjoy peace of mind and be stress free by earning a second income easily promoting products you use every day. GDL is proud to work with <strong>NHT Global</strong> as an independent distributor. Learn more about this exciting opportunity on our site. And Yes, don't hesitate to contact us if need assistance.</p>",
  welcome_section_image_url: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=400&fit=crop",
  
  about_section_title: "About NHT Global",
  about_section_content: "<p>NHT Global mission is to improve the way you feel- about yourself and about work. Providing effective, quality-of-life products for our customers and possibly the most lucrative compensation plan ever for the members and committed to the wellness of people across the globe.</p><ul><li>Proven company with a record breaking 15+ years history</li><li>Revolutionary e-commerce business model that is the envy of the industry</li><li>Currently operating in more than 38 countries and shipping product into more than 50</li><li>High impacting products promoting a healthy lifestyle</li><li>A balanced healthy lifestyle created through improved Physical health, Emotional health, and Financial health</li><li>Training system in place to ensure your success</li></ul>",
  about_section_image_url: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=600&h=400&fit=crop",
  
  history_section_title: "History of NHT Global",
  history_section_content: "<p><strong>Started in 2001</strong>, global headquarters in Los Angeles, California</p><p>To date, global sales are regularly increasing and growing at a record pace. Financial stable and carrying a legacy of 15+ years old company.</p><h3>Facts about the high impacting and high quality products:</h3><ul><li>Contain nobel prize winning research</li><li>Proprietary formulas developed to satisfy your wants</li><li>Are consumable, highly marketable and priced right</li><li>Developed loyal customers who know & love NHT global</li></ul><h3>Seamless global compensation plan that has:</h3><ul><li>Developed many successful individuals</li><li>Allowed to become entrepreneurs with their efforts and company's support</li></ul>",
  history_section_image_url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=400&fit=crop",
  
  video_section_title: "Watch NHT Global Video",
  video_section_youtube_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  video_section_file_url: null,
  
  help_section_title: "How Get Dream Life Can Help",
  help_section_content: "<p>We are team of professional believe in your success is our success. Will provide you all possible support like:</p><ul><li>Training to understand the business in detail</li><li>Marketing platform and all possible tools to get success faster</li><li>Direct contact with founding members and top leaders committed to your success</li><li>All support to open new market or country where you can become pioneer</li></ul>",
  help_section_image_url: "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=600&h=400&fit=crop",
});

// Default Opportunity Page Data
const getDefaultOpportunityPageData = () => ({
  hero_section_content: "A lifetime opportunity",
  hero_section_image_url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=600&fit=crop",
  
  description_section_content: "<p><strong>Unleashing the power of people and it's potential!</strong></p><p>NHT Global allows you to achieve better health, a countless income opportunity and free time to spend with your loved ones.</p>",
  
  door_section_title: "Open the Door of Opportunity",
  door_section_content: "<ul><li>Take that next step to changing your destiny</li><li>Choose the opportunity that offers you a proven formula to build your own future</li><li>Change your focus to building a healthy lifestyle</li><li>Open your mind to developing a wellness tradition across the globe</li><li>Share this opportunity with others</li><li>Open the door to NHT Global… <strong>Top Network Marketing Company Globally</strong></li></ul>",
  door_section_image_url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=600&fit=crop",
  
  marketing_section_title: "Why Network Marketing",
  marketing_section_content: "<ul><li>Direct selling industry is more than 50 years old</li><li>More than $110 billion global industry and growing</li><li>Doing business in more than 172 countries worldwide</li><li>People of all ages, races, and backgrounds are involved</li><li>Has empowered millions of people around the world</li><li>High income potential</li><li>Be your own boss</li><li>No employees, no payroll, no storefront and low overhead</li><li>Major tax advantages</li><li>Best chance for the average person to succeed and create a life that is more than average</li><li>Global opportunity with no limits</li></ul><p><strong>Lets Meet World of Opportunity!</strong></p><p>A global company which gives you <strong>True Potential…</strong></p>",
  marketing_section_image_url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&h=600&fit=crop",
  
  business_model_section_title: "NHT Global has a PROVEN Business Model",
  business_model_section_content: "<ul><li>Offices worldwide and distribution within more than 50 countries</li><li>More than $1.5 billion in sales and growing</li><li>Member of the Direct Selling Association</li><li>Subsidiary of 23-year-old publicly traded company, Natural Health Trends Corp. (trading symbol: NHTC)</li><li>Experienced executive team and global leaders to support you at each step towards your success</li></ul>",
  business_model_section_image_url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=600&fit=crop",
  
  overview_section_title: "NHT Global Opportunity Overview by Founder Members",
  overview_section_youtube_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  overview_section_video_url: null,
  
  compensation_plan_section_title: "What is Compensation Plan",
  compensation_plan_section_content: "<p>To know compensation and earning potential better it is important to following terms:</p><h3>Bonus Volume (BV):</h3><p>The NHT Global Compensation Plan is built around the retailability of our products. In order to keep the products competitively priced at the retail level and to ensure a profitable wholesale to retail margin for our distributor base, we assign a point value (called Bonus Volume or BV) to each of our products, and the compensation program is based on the accumulation of these points. NHT Global gives each product the maximum points possible to create the ideal balance between significant retail profits and substantial override income for our distributor.</p><h3>Personal Volume (PV):</h3><p>Your personal purchase or sales volume and refers to the product orders that are processed through your Distributor ID#.</p><h3>Personal Group Volume (PGV):</h3><p>Product purchased by you and your directly sponsored members. Your Personal Group consists of your personally-sponsored Distributors, regardless of their placement in the genealogy tree. Your Personal Group BV is the combined total of all the wholesale product orders that are processed through your Personal Group Distributors.</p><h3>Active Status:</h3><p>Become active to receive commission/income when you personally sponsor just 2 people in both legs (details in 'Compensation Plan' page)</p><h3>Distributor Level:</h3><p>There are 3 levels of distributor level. Bronze, Silver and Gold. The discounts on products and commission varies as per level. You can directly become Gold distributor thru purchasing specially designed Gold or Platinum package for people who can not wait and want to go full speed from first day.</p><p>Discounts on products for Bronze is 3%, Silver is 11% and Gold is 34%.</p><h3>Product Packages:</h3><p>There are different package similar to Distributor levels. Gold package is for getting maximum discount and maximum commission. Silver package to become Silver member and for becoming Bronze, buy Bronze package or you can buy simply 90 BV worth of products.</p><p>Platinum package is specially designed promotional package to give you value for your money and give you power of all the products for your self use or for selling. For Gold and Platinum package purchase, your distributor level is Gold which is maximum level for Discounts and Commissions/Earnings.</p><p>Gold package gives you free back office access for 1 year and Platinum gives you lifetime free back office access to see you business growth, ecommerce site to sell product directly in all countries where NHT Global is operational. For Silver and Bronze package, there is charge of USD 50 and renew annually.</p><h3>Investment</h3><p>You may choose any package to start. However we recommend Platinum or Gold package for serious people. It will help you getting maximum discount and earning commission from day 1.</p><ul><li><strong>Platinum package</strong> costs around USD 2000 (equivalent to your respective country currency) which includes almost all the products which NHT Global offers and one of the right kits to start your business with all the products.</li><li><strong>Gold package</strong> costs approximately USD 1000. There are various packages to select from as per your need.</li><li><strong>Silver package</strong> costs around approximately USD 500</li><li>For <strong>Bronze level</strong> you need to 90 BV (Bonus Volume) worth of products and Business Builder package. 90 BV of product costs you approximately 250 USD and USD 50 for Business Builder Package (Back office Access). There are some Bronze packages also to start with.</li></ul><p><em>Please note that there is nominal delivery charges and might be some additional state tax as per government rules in your country or state. Costing may little vary from country to country</em></p>",
  compensation_plan_document_url: null,
});

// ✅ FIXED: Added missing banner_section_title field
const getDefaultProductPageData = () => ({
  banner_section_title: "Welcome to Our Products", // 🆕 ADDED - This was missing!
  banner_section_image_url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1200&h=600&fit=crop",
  banner_section_content: "Discover amazing products that transform your life",
  
  about_section_title: "Product is Life Line of Any Business",
  about_section_content: "<p>Product is life line of any business. <strong>Unique products</strong> make it very easy to do business. Product in <strong>Health & Wellness, Beauty & Anti Aging</strong> is evergreen and never going to out of business.</p><p>At NHT Global, we understand that different lifestyles call for different needs. For the modern day city dweller in particular, an urban lifestyle is often associated with stress, busy schedules, environmental toxins and pollutants, poor food choices, and work pressure. These factors affect overall quality life and can challenge our bodies in ways that require additional support. From anti-aging skincare to antioxidant rich beverages, NHT products have been designed to supplement your daily routine and help you live a healthier and better life. We target your specific needs with multi-functional, multi-benefit products that are safe, immediate impact, and easy to use and incorporate into your current lifestyle.</p>",
  about_section_image_url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=400&fit=crop",
  
  video_section_title: "Watch NHT Global Product Video",
  video_section_content: "<p>NHT products fall under <strong>4 major categories: Beauty, Lifestyle, Wellness and Herbal</strong>. In few markets we have introduced a new category called '<strong>Home</strong>' where we are bringing good home products like air and water purifiers. We uphold the highest quality standards— we use leading domestic and foreign GMP certified contract manufacturers, utilize high technology, source the finest ingredients, and are fueled by market trends and the latest scientific research. Quality and satisfaction are guaranteed. Whether you want to supplement your current lifestyle or make a major lifestyle change, NHT Global offers product solutions to help you look and feel better today, and in the long-term!</p><p><strong>Your key to health, beauty, vitality, longevity, and protection lie with the targeted benefits of our premium product offering.</strong></p><p><em>Note: Availability of products may vary country to country. Get in touch with more details if you want to buy any product for personal use.</em></p>",
  video_section_youtube_url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  video_section_file_url: null,
});

// ✅ OPTIMIZED: Create all default pages for a tenant
const createDefaultPagesForTenant = async (tenantId) => {
  const results = {
    homepage: false,
    opportunityPage: false,
    productPage: false,
    errors: [],
  };

  // Define page creation tasks
  const pageTasks = [
    {
      name: "homepage",
      table: "tbl_home_pages",
      dataGetter: getDefaultHomePageData,
      resultKey: "homepage",
    },
    {
      name: "opportunity",
      table: "tbl_opportunity_page",
      dataGetter: getDefaultOpportunityPageData,
      resultKey: "opportunityPage",
    },
    {
      name: "product",
      table: "tbl_product_page",
      dataGetter: getDefaultProductPageData,
      resultKey: "productPage",
    },
  ];

  // Create pages in parallel for better performance
  await Promise.all(
    pageTasks.map(async ({ name, table, dataGetter, resultKey }) => {
      try {
        const pageData = {
          tenant_id: tenantId,
          ...dataGetter(),
        };
        await db.insert(table, pageData);
        results[resultKey] = true;
        console.log(`✅ ${name} page created for tenant ${tenantId}`);
      } catch (error) {
        console.error(`❌ ${name} page creation failed:`, error.message);
        results.errors.push({ page: name, error: error.message });
      }
    })
  );

  return results;
};

module.exports = {
  getDefaultHomePageData,
  getDefaultOpportunityPageData,
  getDefaultProductPageData,
  createDefaultPagesForTenant,
};